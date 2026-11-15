/**
 * Vitest global setup for the `db` project: make sure the test database exists and is migrated.
 *
 * The database is kept between runs (tests create their own uniquely named rows), so several
 * runs can share it. Set TEST_DB_RESET=1 to drop and rebuild it from the migrations.
 * Creating the database needs the MariaDB root password (DB_ROOT_PASSWORD, as in docker-compose).
 */
import { config } from 'dotenv';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { testDatabaseUrl } from './testDb';

export default async function setup() {
	config({ quiet: true });
	const url = new URL(testDatabaseUrl(process.env));
	const name = url.pathname.replace(/^\//, '');
	if (!name.endsWith('_test')) throw new Error(`Refusing to run database tests against "${name}" (name must end in _test).`);

	const rootUrl = new URL(url);
	rootUrl.username = 'root';
	rootUrl.password = process.env.DB_ROOT_PASSWORD || 'rootpass';
	rootUrl.pathname = '/';

	let root: mysql.Connection;
	try {
		root = await mysql.createConnection({ uri: process.env.TEST_DB_ROOT_URL || rootUrl.toString() });
	} catch (e) {
		throw new Error(`Can't reach MariaDB for the database tests. Start it with \`bun run db:up\`.\n${(e as Error).message}`);
	}
	try {
		const LOCK = `${name}_setup`;
		await root.query('SELECT GET_LOCK(?, 120)', [LOCK]);
		try {
			if (process.env.TEST_DB_RESET === '1') await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
			await root.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4`);
			if (url.username && url.username !== 'root') {
				await root.query(`GRANT ALL PRIVILEGES ON \`${name}\`.* TO ?@'%'`, [decodeURIComponent(url.username)]);
			}
			const conn = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
			try {
				await migrate(drizzle(conn), { migrationsFolder: './drizzle' });
			} finally {
				await conn.end();
			}
		} finally {
			await root.query('SELECT RELEASE_LOCK(?)', [LOCK]);
		}
	} finally {
		await root.end();
	}
}
