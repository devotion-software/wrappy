/** Shared by playwright.config.ts and the tests. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 5183);
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const MAILPIT_URL = process.env.MAILPIT_URL ?? `http://localhost:${process.env.MAILPIT_UI_PORT || 8028}`;
