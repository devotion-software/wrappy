import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { friendGroup } from '#lib/server/db/schema';
import { groupForMember, groupMembers, leaveGroup, parseGroupName, removeMember } from '#lib/server/groups';
import { newToken } from '#lib/server/ids';
import { sendGroupInviteEmail } from '#lib/server/email';
import { takeGroupInviteBudget } from '#lib/server/rateLimit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const me = locals.user!;
	const g = await groupForMember(params.id, me.id);
	const members = await groupMembers(g.id);
	return {
		group: { id: g.id, name: g.name, joinToken: g.joinToken },
		isOwner: g.ownerId === me.id,
		ownerId: g.ownerId,
		members: members.map((m) => ({ id: m.id, name: m.name, username: m.username }))
	};
};

async function memberGroup(event: RequestEvent) {
	return groupForMember(event.params.id, event.locals.user!.id);
}

async function ownerGroup(event: RequestEvent) {
	const g = await memberGroup(event);
	if (g.ownerId !== event.locals.user!.id) error(403, 'Only the person who runs this group can do that.');
	return g;
}

export const actions: Actions = {
	/** Anyone in the group can invite someone by email. Doesn't say whether they have an account. */
	invite: async (event) => {
		const me = event.locals.user!;
		const g = await memberGroup(event);
		const email = String((await event.request.formData()).get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return fail(400, { inviteError: 'Enter a full email address.' });
		if (email === me.email.toLowerCase()) return fail(400, { inviteError: "That's your own email." });
		if (!(await takeGroupInviteBudget(me.id))) {
			return fail(429, { inviteError: "You've sent a lot of invites. Wait a while and try again." });
		}
		await sendGroupInviteEmail({
			email,
			inviterName: me.name,
			groupName: g.name,
			url: `${event.url.origin}/groups/join/${g.joinToken}`
		}).catch(() => {});
		return { invited: email };
	},

	leave: async (event) => {
		const g = await memberGroup(event);
		await leaveGroup(g, event.locals.user!.id);
		redirect(303, '/friends#groups');
	},

	rename: async (event) => {
		const g = await ownerGroup(event);
		const parsed = parseGroupName((await event.request.formData()).get('name'));
		if ('error' in parsed) return fail(400, { renameError: parsed.error });
		await db.update(friendGroup).set({ name: parsed.name }).where(eq(friendGroup.id, g.id));
		return { renamed: true };
	},

	remove: async (event) => {
		const g = await ownerGroup(event);
		const userId = String((await event.request.formData()).get('userId') ?? '');
		await removeMember(g, userId);
		return { removed: userId };
	},

	/** A new link: the old one stops working, so anyone it was passed on to can't join. */
	resetLink: async (event) => {
		const g = await ownerGroup(event);
		await db.update(friendGroup).set({ joinToken: newToken() }).where(eq(friendGroup.id, g.id));
		return { linkReset: true };
	},

	delete: async (event) => {
		const g = await ownerGroup(event);
		await db.delete(friendGroup).where(eq(friendGroup.id, g.id));
		redirect(303, '/friends#groups');
	}
};
