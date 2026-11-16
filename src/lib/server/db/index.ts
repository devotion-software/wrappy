import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start the database.');
}

// Reuse a single pool across HMR reloads in dev.
const globalForDb = globalThis as unknown as { __wrappyPool?: mysql.Pool };

const pool =
	globalForDb.__wrappyPool ??
	mysql.createPool({
		uri: connectionString,
		// Per app instance: keep instances × DB_POOL_SIZE under the database's max_connections.
		connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
		// utf8mb4 so emoji in item names survive the round-trip.
		charset: 'utf8mb4',
		// MariaDB returns DECIMAL/BIGINT as strings by default; keep dates as JS Dates.
		dateStrings: false
	});

if (process.env.NODE_ENV !== 'production') globalForDb.__wrappyPool = pool;

export const db = drizzle(pool, { schema, mode: 'default' });
export type DB = typeof db;
