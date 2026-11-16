/**
 * The single place that decides what a viewer may learn about an item's claim.
 *
 * Rules (see Duet "Allow other users to mark items as bought or not…"):
 *  - The list owner NEVER sees a claim, unless they have marked "received from" the
 *    person who claimed it AND that claim is "bought". "Buying" is never revealed.
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
}

export interface ClaimContext {
	viewerId: string | null;
	ownerId: string;
	/** Givers the owner has marked as "received from". */
	revealedGiverIds: ReadonlySet<string>;
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
		if (claim.status === 'bought' && ctx.revealedGiverIds.has(claim.userId)) {
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
	/** The viewer's own claim. */
	mine: { status: ClaimStatus } | null;
	/** Other people's claims the viewer is allowed to know about (each passed through viewClaim). */
	others: { status: ClaimStatus; byName: string | null }[];
	/** How many the owner wants; null means any number. */
	quantity: number | null;
	/**
	 * No one else can claim it. Never true for the owner, so a full item can't give away
	 * that it has been claimed.
	 */
	full: boolean;
}

/**
 * Summarise an item's claims for one viewer. `contextFor` gives each claim's context (whether
 * that claimer can see the list); the owner/claimer rules all live in viewClaim.
 */
export function summariseClaims(
	claims: RawClaim[],
	quantity: number | null,
	contextFor: (claim: RawClaim) => ClaimContext
): ItemClaims {
	let mine: ItemClaims['mine'] = null;
	const others: ItemClaims['others'] = [];
	let isOwner = false;
	for (const c of claims) {
		const ctx = contextFor(c);
		isOwner = ctx.viewerId === ctx.ownerId;
		const v = viewClaim(c, ctx);
		if (!v) continue;
		if (v.mine) mine = { status: v.status };
		else others.push({ status: v.status, byName: v.byName });
	}
	return { mine, others, quantity, full: !isOwner && quantity !== null && claims.length >= quantity };
}
