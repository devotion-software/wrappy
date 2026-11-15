import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { testDatabaseUrl } from './tests/setup/testDb.ts';
import { BASE_URL, E2E_PORT } from './tests/e2e/env.ts';

// Browser tests run the dev server on its own port, against the test database, with sign-in
// codes going to Mailpit (`bun run db:up` starts both MariaDB and Mailpit).
config({ quiet: true });

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	timeout: 60_000,
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ }
	],
	webServer: {
		command: `bunx vite dev --port ${E2E_PORT} --strictPort`,
		url: `${BASE_URL}/healthz`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			DATABASE_URL: testDatabaseUrl(process.env),
			BETTER_AUTH_URL: BASE_URL,
			RESEND_API_KEY: '',
			SMTP_HOST: process.env.SMTP_HOST || 'localhost',
			SMTP_PORT: process.env.SMTP_PORT || '1028'
		}
	}
});
