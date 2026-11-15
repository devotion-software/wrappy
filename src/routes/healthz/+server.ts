import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db';
import type { RequestHandler } from './$types';

/** Load-balancer health check: up only while this instance can reach the database. */
export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`SELECT 1`);
		return new Response('ok', { headers: { 'cache-control': 'no-store' } });
	} catch {
		return new Response('database unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
