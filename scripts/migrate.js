// Production migration runner. Applies ./drizzle/*.sql using drizzle-orm's
// migrator (a runtime dependency) so the prod image does NOT need drizzle-kit.
// Env vars are injected by the host (Coolify) — no dotenv here on purpose.
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
// Several app instances may start at once; a named lock makes them migrate one at a time
// (the rest wait, then find nothing left to apply). Released automatically if this connection drops.
const LOCK = 'wishlist_migrations';
try {
	const [[{ got }]] = await connection.query('SELECT GET_LOCK(?, 300) AS got', [LOCK]);
	if (got !== 1) throw new Error('Timed out waiting for another instance to finish migrating');
	try {
		await migrate(drizzle(connection), { migrationsFolder: './drizzle' });
		console.log('✓ migrations applied');
	} finally {
		await connection.query('SELECT RELEASE_LOCK(?)', [LOCK]);
	}
} finally {
	await connection.end();
}
