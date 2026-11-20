/**
 * The single place that decides what a viewer may learn about an item's claim.
 *
 * Rules (see Duet "Allow other users to mark items as bought or not…"):
 *  - The list owner NEVER sees a claim unless it is "bought" AND revealed: a claim for one of
 *    the list's occasions is revealed when the owner opens that occasion; any other claim when
 *    the owner marks "received from" its claimer. "Buying" is never revealed.
 *  - The claimer sees their own claim.
 *  - Everyone else sees that the item is taken, with the claimer's name only when
 *    the claimer can also see the list being viewed.
 *
 * Every server load that returns items must pass claims through this function, so
 * claim data never reaches the owner's browser.
 */

export type ClaimStatus = 'buying' | 'bought';

export interface RawClaim {
	userId: string;
	status: ClaimStatus;
	/** Claimer's display name. */
	name: string;
	/** Group gifts: how much they're chipping in. */
	amount?: string | null;
	/** The occasion (list_occasion) it's for, if the list has any. */
	occasionId?: string | null;
}

/**
 * Has the owner revealed this bought present? Occasion presents wait for their occasion to be
 * opened, so "received from" Mum after a birthday doesn't spoil what she got for Christmas.
 */
export function revealedToOwner(
	g: { userId: string; occasionId?: string | null },
	revealedGiverIds: ReadonlySet<string>,
	openedOccasionIds: ReadonlySet<string>
): boolean {
	return g.occasionId ? openedOccasionIds.has(g.occasionId) : revealedGiverIds.has(g.userId);
}

/** What decides whether an item can take more claims. */
export interface ClaimTarget {
	quantity: number | null;
	groupGift: boolean;
	price: string | null;
}

/** Money as whole pence/cents, so sums don't drift. */
export const toCents = (v: string | null | undefined) => Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

/** Total chipped in towards a group gift, in cents. */
export function pledgedCents(claims: { amount?: string | null }[]): number {
	return claims.reduce((n, c) => n + toCents(c.amount), 0);
}

/**
 * No one else can claim it: every one wanted is claimed, or a group gift's price is covered.
 * A group gift with no price is never full.
 */
export function isFull(target: ClaimTarget, claims: { amount?: string | null }[]): boolean {
	if (target.groupGift) return target.price !== null && pledgedCents(claims) >= toCents(target.price);
	return target.quantity !== null && claims.length >= target.quantity;
}

export interface ClaimContext {
	viewerId: string | null;
	ownerId: string;
	/** Givers the owner has marked as "received from". */
	revealedGiverIds: ReadonlySet<string>;
	/** Occasions the owner has opened. */
	openedOccasionIds?: ReadonlySet<string>;
	/** Whether the claimer can see the list currently being viewed. */
	claimerCanSeeList: boolean;
}

export type ClaimView =
	| { status: ClaimStatus; mine: true; byName: null }
	| { status: ClaimStatus; mine: false; byName: string | null }
	| null;

export function viewClaim(claim: RawClaim | null | undefined, ctx: ClaimContext): ClaimView {
	if (!claim) return null;

	if (ctx.viewerId === ctx.ownerId) {
		if (claim.status === 'bought' && revealedToOwner(claim, ctx.revealedGiverIds, ctx.openedOccasionIds ?? new Set())) {
			return { status: 'bought', mine: false, byName: claim.name };
		}
		return null;
	}

	if (ctx.viewerId && ctx.viewerId === claim.userId) {
		return { status: claim.status, mine: true, byName: null };
	}

	return { status: claim.status, mine: false, byName: ctx.claimerCanSeeList ? claim.name : null };
}

/** Everything a viewer may know about who's getting an item (it can be wanted more than once). */
export interface ItemClaims {
	/** The viewer's own claim (with what they're chipping in, for a group gift). */
	mine: { status: ClaimStatus; amount?: string | null; occasionId: string | null } | null;
	/**
	 * Other people's claims the viewer is allowed to know about (each passed through viewClaim),
	 * with the occasion they're for (guests only).
	 */
	others: { status: ClaimStatus; byName: string | null; amount?: string | null; occasionId?: string | null }[];
	/** How many the owner wants; null means any number. */
	quantity: number | null;
	/**
	 * No one else can claim it. Never true for the owner, so a full item can't give away
	 * that it has been claimed.
	 */
	full: boolean;
	/**
	 * Group gifts: the price to reach and (for guests only) how much is chipped in so far.
	 * The owner gets `pledged: null` and never sees anyone's amount.
	 */
	group: { target: string; pledged: string | null } | null;
}

/**
 * Summarise an item's claims for one viewer. `contextFor` gives each claim's context (whether
 * that claimer can see the list); the owner/claimer rules all live in viewClaim.
 */
export function summariseClaims(
	claims: RawClaim[],
	target: ClaimTarget,
	isOwner: boolean,
	contextFor: (claim: RawClaim) => ClaimContext
): ItemClaims {
	let mine: ItemClaims['mine'] = null;
	const others: ItemClaims['others'] = [];
	const group = target.groupGift && target.price !== null;
	for (const c of claims) {
		const v = viewClaim(c, contextFor(c));
		if (!v) continue;
		// Amounts are for fellow givers only, never the owner.
		const amount = group && !isOwner ? (c.amount ?? null) : undefined;
		if (v.mine) mine = { status: v.status, occasionId: c.occasionId ?? null, ...(amount !== undefined ? { amount } : {}) };
		else
			others.push({
				status: v.status,
				byName: v.byName,
				...(amount !== undefined ? { amount } : {}),
				// Fellow guests see which occasion it's for; the owner doesn't need it.
				...(isOwner ? {} : { occasionId: c.occasionId ?? null })
			});
	}
	return {
		mine,
		others,
		quantity: target.quantity,
		full: !isOwner && isFull(target, claims),
		group: group ? { target: target.price!, pledged: isOwner ? null : fromCents(pledgedCents(claims)) } : null
	};
}
