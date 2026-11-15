/**
 * Email delivery for Wishlist.
 *
 * Delivery is chosen at runtime, in order:
 *   1. Resend API   — when RESEND_API_KEY is set (production).
 *   2. SMTP          — when SMTP_HOST is set (dev uses Mailpit on :1026).
 *   3. Console       — last-resort fallback so the flow still works unconfigured.
 */

type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

interface OtpEmail {
	email: string;
	otp: string;
	type: OtpType;
}

const SUBJECTS: Record<OtpType, string> = {
	'sign-in': 'Your Wishlist sign-in code',
	'email-verification': 'Verify your email for Wishlist',
	'forget-password': 'Reset your Wishlist password',
	'change-email': 'Confirm your new Wishlist email'
};

const INTRO: Record<OtpType, string> = {
	'sign-in': 'Use this code to sign in to Wishlist.',
	'email-verification': 'Use this code to verify your email address.',
	'forget-password': 'Use this code to reset your password.',
	'change-email': 'Use this code to confirm your new email address.'
};

export async function sendOtpEmail({ email, otp, type }: OtpEmail): Promise<void> {
	const subject = SUBJECTS[type] ?? 'Your Wishlist code';
	const html = renderOtpHtml(otp, INTRO[type] ?? INTRO['sign-in']);
	const text = `${INTRO[type] ?? ''}\n\nYour code is ${otp}\nIt expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;

	await deliver({ to: email, subject, html, text }, `code: ${otp}  (valid 10 min)`);
}

/** Someone shared a private list with this email address. */
export async function sendListInviteEmail(opts: { email: string; ownerName: string; listTitle: string; url: string }) {
	const owner = escapeHtml(opts.ownerName);
	const title = escapeHtml(opts.listTitle);
	await deliver(
		{
			to: opts.email,
			subject: `${opts.ownerName} shared a wish list with you`,
			html: renderLayout(
				`<strong>${owner}</strong> shared their wish list <strong>${title}</strong> with you. Have a look, and quietly claim anything you'd like to get them — ${owner} won't see.`,
				button(opts.url, `Open ${title}`)
			),
			text: `${opts.ownerName} shared their wish list "${opts.listTitle}" with you.\n\nOpen it: ${opts.url}`
		},
		`list invite: ${opts.url}`
	);
}

/** Secret Santa names have been drawn: tell one member who they're buying for. */
export async function sendSantaAssignmentEmail(opts: {
	email: string;
	santaName: string;
	recipientName: string;
	budget: string | null;
	exchangeDate: string | null;
	url: string;
}) {
	const meta = [opts.budget ? `Budget ${opts.budget}` : null, opts.exchangeDate ? `swap on ${opts.exchangeDate}` : null]
		.filter(Boolean)
		.join(" · ");
	await deliver(
		{
			to: opts.email,
			subject: `${opts.santaName}: you're buying for ${opts.recipientName}`,
			html: renderLayout(
				`Names have been drawn for <strong>${escapeHtml(opts.santaName)}</strong>.` +
					`<div style="margin:18px 0 6px;padding:18px 20px;background:#F4EEDD;font-family:Caveat,'Comic Sans MS',cursive;font-size:30px;font-weight:700;color:#1C1C1C;">You're buying for ${escapeHtml(opts.recipientName)}</div>` +
					(meta ? `<div style="font-size:14px;color:#5E5E5A;">${escapeHtml(meta)}</div>` : "") +
					`<p style="margin:12px 0 0;">Only you can see this. Their wish list is waiting for you.</p>`,
				button(opts.url, `See ${opts.recipientName}'s list`)
			),
			text: `Names have been drawn for ${opts.santaName}.\n\nYou're buying for ${opts.recipientName}.${meta ? "\n" + meta : ""}\n\nSee their list: ${opts.url}`
		},
		`santa: buying for ${opts.recipientName} — ${opts.url}`
	);
}

// ── Reminders (sent by server/reminders.ts) ─────────────────────────────────

interface ReminderBase {
	email: string;
	url: string;
	/** Turns off this kind of reminder. Shown in the footer and as a List-Unsubscribe header. */
	unsubscribeUrl: string;
	settingsUrl: string;
}

function reminderFootnote(r: ReminderBase): string {
	return `You're getting this because you use Wishlist. <a href="${escapeHtml(r.unsubscribeUrl)}" style="color:#5E5E5A;">Stop these reminders</a> or <a href="${escapeHtml(r.settingsUrl)}" style="color:#5E5E5A;">choose which emails you get</a>.`;
}
const reminderTextFooter = (r: ReminderBase) => `\n\n—\nStop these reminders: ${r.unsubscribeUrl}\nChoose which emails you get: ${r.settingsUrl}`;

/** A friend's list date is coming up and you haven't claimed anything on it. */
export async function sendListReminderEmail(
	r: ReminderBase & { ownerName: string; listTitle: string; when: string; daysLeft: number; unclaimed: number }
) {
	const soon = r.daysLeft <= 0 ? 'today' : r.daysLeft === 1 ? 'tomorrow' : `in ${r.daysLeft} days`;
	const left = r.unclaimed === 1 ? '1 wish is' : `${r.unclaimed} wishes are`;
	await deliver(
		{
			to: r.email,
			subject: `${r.ownerName}'s ${r.listTitle} is ${soon}`,
			html: renderLayout(
				`<strong>${escapeHtml(r.ownerName)}</strong>'s list <strong>${escapeHtml(r.listTitle)}</strong> is for ${escapeHtml(r.when)}, ${soon}. ${left} still free to claim.`,
				button(r.url, `Open ${r.listTitle}`),
				reminderFootnote(r)
			),
			text: `${r.ownerName}'s list "${r.listTitle}" is for ${r.when}, ${soon}. ${left} still free to claim.\n\nOpen it: ${r.url}${reminderTextFooter(r)}`,
			headers: { 'List-Unsubscribe': `<${r.unsubscribeUrl}>` }
		},
		`list reminder: ${r.listTitle} ${soon} → ${r.url}`
	);
}

/** You said "I'll get it" a while ago and haven't marked it bought. */
export async function sendBuyingReminderEmail(r: ReminderBase & { ownerName: string; itemTitle: string; weeks: number }) {
	await deliver(
		{
			to: r.email,
			subject: `Did you get ${r.itemTitle} for ${r.ownerName}?`,
			html: renderLayout(
				`${r.weeks} weeks ago you said you'd get <strong>${escapeHtml(r.itemTitle)}</strong> for ${escapeHtml(r.ownerName)}. If you've bought it, mark it as bought. If not, it's still reserved for you, or you can let it go so someone else can get it.`,
				button(r.url, 'Open the wish'),
				reminderFootnote(r)
			),
			text: `${r.weeks} weeks ago you said you'd get "${r.itemTitle}" for ${r.ownerName}. If you've bought it, mark it as bought. If not, it's still reserved for you, or you can let it go so someone else can get it.\n\nOpen it: ${r.url}${reminderTextFooter(r)}`,
			headers: { 'List-Unsubscribe': `<${r.unsubscribeUrl}>` }
		},
		`buying reminder: ${r.itemTitle} → ${r.url}`
	);
}

/** The Secret Santa swap is coming up. */
export async function sendSantaReminderEmail(
	r: ReminderBase & { santaName: string; recipientName: string; when: string; daysLeft: number; budget: string | null }
) {
	const soon = r.daysLeft <= 0 ? 'today' : r.daysLeft === 1 ? 'tomorrow' : `in ${r.daysLeft} days`;
	const budget = r.budget ? ` The limit is ${r.budget}.` : '';
	await deliver(
		{
			to: r.email,
			subject: `${r.santaName}: the swap is ${soon}`,
			html: renderLayout(
				`The <strong>${escapeHtml(r.santaName)}</strong> swap is on ${escapeHtml(r.when)}, ${soon}. You're buying for <strong>${escapeHtml(r.recipientName)}</strong>.${escapeHtml(budget)}`,
				button(r.url, `See ${r.recipientName}'s list`),
				reminderFootnote(r)
			),
			text: `The ${r.santaName} swap is on ${r.when}, ${soon}. You're buying for ${r.recipientName}.${budget}\n\nSee their list: ${r.url}${reminderTextFooter(r)}`,
			headers: { 'List-Unsubscribe': `<${r.unsubscribeUrl}>` }
		},
		`santa reminder: ${r.santaName} ${soon} → ${r.url}`
	);
}

async function deliver(msg: Omit<Message, 'from'>, consoleBody: string): Promise<void> {
	const from = process.env.EMAIL_FROM || 'Wishlist <no-reply@wishlist.local>';
	const full: Message = { from, ...msg };
	if (process.env.RESEND_API_KEY) {
		await sendViaResend(full);
	} else if (process.env.SMTP_HOST) {
		await sendViaSmtp(full);
	} else {
		logToConsole(full.to, full.subject, consoleBody);
	}
}

interface Message {
	from: string;
	to: string;
	subject: string;
	html: string;
	text: string;
	headers?: Record<string, string>;
}

async function sendViaResend(msg: Message): Promise<void> {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			from: msg.from,
			to: [msg.to],
			subject: msg.subject,
			html: msg.html,
			text: msg.text,
			...(msg.headers ? { headers: msg.headers } : {})
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Resend failed (${res.status}): ${body}`);
	}
}

// nodemailer is only loaded on the SMTP path, so the Resend path stays dependency-free.
let transportPromise: Promise<import('nodemailer').Transporter> | null = null;

function getTransport() {
	if (!transportPromise) {
		transportPromise = import('nodemailer').then((nodemailer) => {
			const user = process.env.SMTP_USER;
			const pass = process.env.SMTP_PASSWORD;
			return nodemailer.createTransport({
				host: process.env.SMTP_HOST,
				port: Number(process.env.SMTP_PORT ?? 587),
				secure: process.env.SMTP_SECURE === 'true',
				auth: user ? { user, pass } : undefined
			});
		});
	}
	return transportPromise;
}

async function sendViaSmtp(msg: Message): Promise<void> {
	const transport = await getTransport();
	await transport.sendMail(msg);
}

function logToConsole(email: string, subject: string, body: string): void {
	const line = '─'.repeat(44);
	console.log(
		`\n┌${line}┐\n` +
			`│  📨  ${subject.padEnd(36)}│\n` +
			`│  to: ${email.padEnd(37)}│\n` +
			`│  ${body}`.padEnd(45) +
			`│\n` +
			`└${line}┘\n`
	);
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function button(url: string, label: string): string {
	return `<a href="${escapeHtml(url)}" style="display:inline-block;width:100%;box-sizing:border-box;text-align:center;background:#C9A24A;color:#1C1C1C;text-decoration:none;font-weight:600;font-size:15px;padding:14px 20px;border-radius:999px;">${escapeHtml(label)}</a>`;
}

/** Shared email shell in the Notebook style: paper card, gold margin line, handwritten logo. */
function renderLayout(bodyHtml: string, actionHtml = "", footnote = ""): string {
	return `<!doctype html>
<html>
	<body style="margin:0;background:#ECECEA;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1C1C;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECECEA;padding:32px 16px;">
			<tr><td align="center">
				<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#FAFAF8;border-radius:4px;border-left:2px solid #C9A24A;box-shadow:0 1px 2px rgba(0,0,0,.08),0 10px 24px rgba(0,0,0,.07);">
					<tr><td style="padding:30px 32px 6px;">
						<span style="font-family:Caveat,'Comic Sans MS',cursive;font-size:30px;font-weight:700;color:#1C1C1C;"><span style="color:#C9A24A;">&#10003;</span> wishlist</span>
					</td></tr>
					<tr><td style="padding:12px 32px 4px;font-size:15px;color:#4A4A4A;line-height:1.55;">${bodyHtml}</td></tr>
					${actionHtml ? `<tr><td style="padding:20px 32px 8px;">${actionHtml}</td></tr>` : ""}
					<tr><td style="padding:12px 32px 30px;font-size:13px;color:#5E5E5A;line-height:1.5;">${footnote || "If you weren't expecting this, you can ignore this email."}</td></tr>
				</table>
			</td></tr>
		</table>
	</body>
</html>`;
}

function renderOtpHtml(otp: string, intro: string): string {
	return renderLayout(
		`${intro}<div style="margin:18px 0 0;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:0.22em;text-align:center;white-space:nowrap;background:#F4EEDD;border-radius:4px;padding:20px 12px;color:#1C1C1C;">${otp}</div>`,
		"",
		"This code expires in 10 minutes. If you didn't ask for it, you can ignore this email."
	);
}
