import setupDb from '../setup/db.global';
import { MAILPIT_URL } from './env';

export default async function globalSetup() {
	await setupDb();
	const res = await fetch(`${MAILPIT_URL}/api/v1/info`).catch(() => null);
	if (!res?.ok) throw new Error(`Mailpit isn't reachable at ${MAILPIT_URL}. Start it with \`bun run db:up\`.`);
}
