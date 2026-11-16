import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { passkey } from '@better-auth/passkey';
import { db } from './server/db';
import * as schema from './server/db/schema';
import { sendOtpEmail } from './server/email';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:5182';
const rpID = new URL(baseURL).hostname;

export const auth = betterAuth({
	baseURL,
	secret: process.env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: 'mysql',
		schema
	}),
	// Keep request counts in the database (not process memory) so limits hold across app instances.
	rateLimit: {
		storage: 'database',
		modelName: 'rateLimit'
	},
	// Passwordless only: email one-time codes + passkeys.
	emailAndPassword: {
		enabled: false
	},
	user: {
		additionalFields: {
			// Preferred theme, persisted per user.
			theme: {
				type: 'string',
				required: false,
				defaultValue: 'system',
				input: true
			},
			// Public handle for /u/<username>. Set through the welcome/account pages, which validate it.
			username: {
				type: 'string',
				required: false,
				input: false
			}
		}
	},
	databaseHooks: {
		user: {
			// /api/auth/update-user writes these fields directly, so apply the same rules as the
			// welcome/account forms (which write via Drizzle and don't pass through here).
			update: {
				before: async (data) => ({ data: cleanUserFields(data) })
			},
			create: {
				before: async (data) => ({ data: cleanUserFields(data) as typeof data }),
				// Link any pending list invites sent to this email to the new account.
				after: async (u) => {
					const { claimInvitesForUser } = await import('./server/sharing');
					await claimInvitesForUser(u.id, u.email);
				}
			}
		}
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 10 * 60, // 10 minutes
			sendVerificationOnSignUp: true,
			async sendVerificationOTP({ email, otp, type }) {
				await sendOtpEmail({ email, otp, type });
			}
		}),
		passkey({
			rpID,
			rpName: 'Wrappy',
			origin: baseURL
		})
	]
});

function cleanUserFields<T extends Record<string, unknown>>(data: T): T {
	const out: Record<string, unknown> = { ...data };
	if (typeof out.name === 'string') {
		const name = out.name.trim();
		if (name.length > 60) throw new APIError('BAD_REQUEST', { message: 'Keep your name under 60 characters.' });
		out.name = name;
	}
	if ('theme' in out && !['system', 'light', 'dark'].includes(String(out.theme))) out.theme = 'system';
	// Profile pictures aren't a feature; don't store arbitrary URLs.
	if ('image' in out) out.image = null;
	return out as T;
}

export type Session =typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
