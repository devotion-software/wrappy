import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }));

type EmailModule = typeof import('./email');
const ENV_KEYS = ['RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'];
const saved: Record<string, string | undefined> = {};

async function load(env: Record<string, string> = {}): Promise<EmailModule> {
	for (const k of ENV_KEYS) delete process.env[k];
	Object.assign(process.env, env);
	vi.resetModules();
	return import('./email');
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
	for (const k of ENV_KEYS) saved[k] = process.env[k];
	fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
	sendMail.mockReset();
	createTransport.mockClear();
});
afterEach(() => {
	for (const k of ENV_KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const resendBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('Resend delivery', () => {
	it('posts to the Resend API with the key and sender', async () => {
		const m = await load({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'Wrappy <hi@example.test>', SMTP_HOST: 'smtp.example' });
		await m.sendOtpEmail({ email: 'a@example.test', otp: '123456', type: 'sign-in' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({ authorization: 'Bearer re_test', 'content-type': 'application/json' });
		const body = resendBody();
		expect(body).toMatchObject({ from: 'Wrappy <hi@example.test>', to: ['a@example.test'], subject: 'Your Wrappy sign-in code' });
		expect(body.html).toContain('123456');
		expect(body.text).toContain('Your code is 123456');
		// Resend wins over SMTP.
		expect(createTransport).not.toHaveBeenCalled();
	});

	it('uses a default sender when EMAIL_FROM is unset', async () => {
		const m = await load({ RESEND_API_KEY: 're_test' });
		await m.sendOtpEmail({ email: 'a@example.test', otp: '1', type: 'sign-in' });
		expect(resendBody().from).toBe('Wrappy <no-reply@wrappy.gift>');
	});

	it('throws with the status and body when Resend refuses', async () => {
		fetchMock.mockResolvedValue(new Response('bad sender', { status: 422 }));
		const m = await load({ RESEND_API_KEY: 're_test' });
		await expect(m.sendOtpEmail({ email: 'a@example.test', otp: '1', type: 'sign-in' })).rejects.toThrow(
			'Resend failed (422): bad sender'
		);
	});
});

describe('SMTP delivery', () => {
	it('sends through nodemailer with the configured transport', async () => {
		const m = await load({ SMTP_HOST: 'smtp.example', SMTP_PORT: '2525', SMTP_SECURE: 'true', SMTP_USER: 'u', SMTP_PASSWORD: 'p' });
		await m.sendOtpEmail({ email: 'b@example.test', otp: '654321', type: 'email-verification' });
		expect(createTransport).toHaveBeenCalledWith({ host: 'smtp.example', port: 2525, secure: true, auth: { user: 'u', pass: 'p' } });
		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'b@example.test', subject: 'Verify your email for Wrappy', from: 'Wrappy <no-reply@wrappy.gift>' })
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('defaults to port 587, no TLS and no auth', async () => {
		const m = await load({ SMTP_HOST: 'smtp.example' });
		await m.sendOtpEmail({ email: 'b@example.test', otp: '1', type: 'sign-in' });
		expect(createTransport).toHaveBeenCalledWith({ host: 'smtp.example', port: 587, secure: false, auth: undefined });
	});

	it('reuses one transport across messages', async () => {
		const m = await load({ SMTP_HOST: 'smtp.example' });
		await m.sendOtpEmail({ email: 'b@example.test', otp: '1', type: 'sign-in' });
		await m.sendOtpEmail({ email: 'c@example.test', otp: '2', type: 'sign-in' });
		expect(createTransport).toHaveBeenCalledTimes(1);
		expect(sendMail).toHaveBeenCalledTimes(2);
	});

	it('propagates send failures', async () => {
		sendMail.mockRejectedValueOnce(new Error('connection refused'));
		const m = await load({ SMTP_HOST: 'smtp.example' });
		await expect(m.sendOtpEmail({ email: 'b@example.test', otp: '1', type: 'sign-in' })).rejects.toThrow('connection refused');
	});
});

describe('console fallback', () => {
	it('logs the message when no provider is configured', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const m = await load();
		await m.sendOtpEmail({ email: 'c@example.test', otp: '999000', type: 'sign-in' });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(createTransport).not.toHaveBeenCalled();
		const out = log.mock.calls.flat().join('\n');
		expect(out).toContain('c@example.test');
		expect(out).toContain('999000');
		expect(out).toContain('Your Wrappy sign-in code');
	});
});

describe('message content', () => {
	async function capture(send: (m: EmailModule) => Promise<void>) {
		const m = await load({ RESEND_API_KEY: 're_test' });
		await send(m);
		return resendBody() as { subject: string; html: string; text: string; to: string[] };
	}

	it.each([
		['sign-in', 'Your Wrappy sign-in code', 'Use this code to sign in to Wrappy.'],
		['email-verification', 'Verify your email for Wrappy', 'Use this code to verify your email address.'],
		['forget-password', 'Reset your Wrappy password', 'Use this code to reset your password.'],
		['change-email', 'Confirm your new Wrappy email', 'Use this code to confirm your new email address.']
	] as const)('OTP %s has the right subject and intro', async (type, subject, intro) => {
		const b = await capture((m) => m.sendOtpEmail({ email: 'a@example.test', otp: '112233', type }));
		expect(b.subject).toBe(subject);
		expect(b.html).toContain(intro);
		expect(b.html).toContain('112233');
		expect(b.text).toContain('expires in 10 minutes');
	});

	it('escapes the owner name and list title in invite HTML', async () => {
		const b = await capture((m) =>
			m.sendListInviteEmail({
				email: 'friend@example.test',
				ownerName: '<script>alert(1)</script>',
				listTitle: `Tom & Jerry's "best"`,
				url: 'https://wrappy.example/lists/abc?x=1&y="2"'
			})
		);
		expect(b.subject).toBe('<script>alert(1)</script> shared a wish list with you');
		expect(b.html).not.toContain('<script>');
		expect(b.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(b.html).toContain('Tom &amp; Jerry&#39;s &quot;best&quot;');
		expect(b.html).toContain('href="https://wrappy.example/lists/abc?x=1&amp;y=&quot;2&quot;"');
		// The button label is escaped once, not twice.
		expect(b.html).toContain('>Open Tom &amp; Jerry&#39;s &quot;best&quot;</a>');
		expect(b.html).not.toContain('&amp;#39;');
		expect(b.html).not.toContain('&amp;amp;');
		// Plain text is not HTML-escaped.
		expect(b.text).toContain(`"Tom & Jerry's "best""`);
		expect(b.text).toContain('Open it: https://wrappy.example/lists/abc');
	});

	it('escapes a price-drop email and says what changed', async () => {
		const b = await capture((m) =>
			m.sendPriceDropEmail({
				email: 'v@example.test',
				url: 'https://wrappy.example/lists/l/items/i',
				unsubscribeUrl: 'https://wrappy.example/u/t',
				settingsUrl: 'https://wrappy.example/account#emails',
				ownerName: 'Meg <3',
				itemTitle: 'Lamp & shade',
				shop: 'shop.example.com',
				was: '£40',
				now: '£30'
			})
		);
		expect(b.subject).toBe('Price drop: Lamp & shade is now £30');
		expect(b.html).toContain(`<strong>Lamp &amp; shade</strong> from Meg &lt;3's list is now <strong>£30</strong> at shop.example.com (it was £40).`);
		expect(b.text).toContain('Have a look: https://wrappy.example/lists/l/items/i');
	});

	it('escapes a Secret Santa message', async () => {
		const base = { email: 'b@example.test', santaName: 'Office', url: 'https://wrappy.example/santa/x#messages', unsubscribeUrl: 'https://wrappy.example/u/t', settingsUrl: 'https://wrappy.example/account#emails' };
		const b = await capture((m) => m.sendSantaMessageEmail({ ...base, from: 'Your Secret Santa', preview: '<img src=x onerror=alert(1)> size?' }));
		expect(b.subject).toBe('Office: a message from your Secret Santa');
		expect(b.html).not.toContain('<img src=x');
		expect(b.html).toContain('&lt;img src=x onerror=alert(1)&gt; size?');
		expect(b.text).toContain('Reply: https://wrappy.example/santa/x#messages');
	});

	it("names the recipient when they reply, and shortens long messages", async () => {
		const base = { email: 'a@example.test', santaName: 'Office', url: 'https://wrappy.example/santa/x#messages', unsubscribeUrl: 'https://wrappy.example/u/t', settingsUrl: 'https://wrappy.example/account#emails' };
		const long = await capture((m) => m.sendSantaMessageEmail({ ...base, from: 'Bob', preview: 'y'.repeat(400) }));
		expect(long.subject).toBe('Office: a message from Bob');
		expect(long.text).toContain(`${'y'.repeat(279)}…`);
		expect(long.text).not.toContain('y'.repeat(280));
	});

	it('escapes Secret Santa names and includes budget and date', async () => {
		const b = await capture((m) =>
			m.sendSantaAssignmentEmail({
				email: 's@example.test',
				santaName: 'Office <Party>',
				recipientName: 'Ann & Bob',
				budget: '£20',
				exchangeDate: '20 Dec',
				url: 'https://wrappy.example/santa/x'
			})
		);
		expect(b.subject).toBe("Office <Party>: you're buying for Ann & Bob");
		expect(b.html).toContain('Office &lt;Party&gt;');
		expect(b.html).toContain("You're buying for Ann &amp; Bob");
		expect(b.html).not.toContain('<Party>');
		expect(b.html).toContain('Budget £20 · swap on 20 Dec');
		expect(b.text).toContain("You're buying for Ann & Bob.\nBudget £20 · swap on 20 Dec");
		expect(b.text).toContain('See their list: https://wrappy.example/santa/x');
	});

	it('leaves out the budget line when there is no budget or date', async () => {
		const b = await capture((m) =>
			m.sendSantaAssignmentEmail({
				email: 's@example.test',
				santaName: 'Family',
				recipientName: 'Sam',
				budget: null,
				exchangeDate: null,
				url: 'https://wrappy.example/santa/x'
			})
		);
		expect(b.html).not.toContain('Budget');
		expect(b.html).not.toContain('swap on');
		expect(b.text).toBe("Names have been drawn for Family.\n\nYou're buying for Sam.\n\nSee their list: https://wrappy.example/santa/x");
	});

	it('shows only the date when there is no budget', async () => {
		const b = await capture((m) =>
			m.sendSantaAssignmentEmail({ email: 's@example.test', santaName: 'F', recipientName: 'S', budget: null, exchangeDate: '1 Dec', url: 'u' })
		);
		expect(b.html).toContain('swap on 1 Dec');
		expect(b.html).not.toContain('Budget');
	});
});
