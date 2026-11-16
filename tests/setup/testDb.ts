/**
 * Where the database tests run. Defaults to the dev database's server with `_test` appended
 * to the database name, so `bun run test` can never touch dev data. Override with TEST_DATABASE_URL.
 */
export function testDatabaseUrl(env: Record<string, string | undefined>): string {
	if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
	const u = new URL(env.DATABASE_URL || 'mysql://wrappy:wrappypass@localhost:3313/wrappy');
	const name = u.pathname.replace(/^\//, '') || 'wrappy';
	u.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
	return u.toString();
}
