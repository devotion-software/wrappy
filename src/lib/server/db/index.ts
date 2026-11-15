import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start the database.');
}

// Reuse a single pool across HMR reloads in dev.
const globalForDb = globalThis as unknown as { __wishlistPool?: mysql.Pool };

const pool =
	globalForDb.__wishlistPool ??
	mysql.createPool({
		uri: connectionString,
		connectionLimit: 10,
		// utf8mb4 so emoji in item names survive the round-trip.
		charset: 'utf8mb4',
		// MariaDB returns DECIMAL/BIGINT as strings by default; keep dates as JS Dates.
		dateStrings: false
	});

if (process.env.NODE_ENV !== 'production') globalForDb.__wishlistPool = pool;

export const db = drizzle(pool, { schema, mode: 'default' });
export type DB = typeof db;
