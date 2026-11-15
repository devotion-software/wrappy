import { mySantas } from '#lib/server/santa';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({ santas: await mySantas(locals.user!.id) });
