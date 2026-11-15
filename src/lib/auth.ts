import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
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
			rpName: 'Wishlist',
			origin: baseURL
		})
	]
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
