/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json' with { type: 'json' };
import { testDatabaseUrl } from './tests/setup/testDb.ts';

// Tests never touch the dev database or send real email.
const devEnv = loadEnv('development', process.cwd(), '');
const testEnv = {
	DATABASE_URL: testDatabaseUrl(devEnv),
	RESEND_API_KEY: '',
	SMTP_HOST: '',
	R2_ACCOUNT_ID: '',
	R2_ACCESS_KEY_ID: '',
	R2_SECRET_ACCESS_KEY: '',
	BETTER_AUTH_SECRET: 'test-only-secret-test-only-secret-0123456789',
	BETTER_AUTH_URL: 'http://localhost:5182'
};

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// SvelteKit adds nonces/hashes for its own inline scripts; app.html's theme script uses %sveltekit.nonce%.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte writes inline style attributes, so styles can't be locked to nonces.
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					// Shop pictures are previewed from their sites before import; stored ones redirect to R2.
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	server: {
		// Fixed port keeps BETTER_AUTH_URL / passkey origin stable across restarts.
		port: 5182,
		strictPort: true
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.db.test.ts'],
					env: testEnv
				}
			},
			{
				// Needs MariaDB (`bun run db:up`). Runs against a separate `<db>_test` database.
				extends: true,
				test: {
					name: 'db',
					include: ['src/**/*.db.test.ts', 'tests/**/*.db.test.ts'],
					globalSetup: ['tests/setup/db.global.ts'],
					env: testEnv,
					// One file at a time keeps row locks and timing-sensitive tests predictable.
					fileParallelism: false,
					testTimeout: 20_000,
					hookTimeout: 60_000
				}
			}
		]
	}
});
