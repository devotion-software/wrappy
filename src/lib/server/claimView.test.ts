import { describe, expect, it } from 'vitest';
import { summariseClaims, viewClaim, type ClaimContext, type RawClaim } from './claimView';

const owner = 'owner';
const sam = 'sam';
const priya = 'priya';

const ctx = (over: Partial<ClaimContext> = {}): ClaimContext => ({
	viewerId: priya,
	ownerId: owner,
	revealedGiverIds: new Set(),
	claimerCanSeeList: true,
	...over
});
const buying: RawClaim = { userId: sam, status: 'buying', name: 'Sam' };
const bought: RawClaim = { userId: sam, status: 'bought', name: 'Sam' };

describe('viewClaim — owner', () => {
	it('hides buying and bought claims from the owner', () => {
		expect(viewClaim(buying, ctx({ viewerId: owner }))).toBeNull();
		expect(viewClaim(bought, ctx({ viewerId: owner }))).toBeNull();
	});

	it('reveals a bought claim once the owner marked received from that giver', () => {
		expect(viewClaim(bought, ctx({ viewerId: owner, revealedGiverIds: new Set([sam]) }))).toEqual({
			status: 'bought',
			mine: false,
			byName: 'Sam'
		});
	});

	it('never reveals a buying claim, even after received from', () => {
		expect(viewClaim(buying, ctx({ viewerId: owner, revealedGiverIds: new Set([sam]) }))).toBeNull();
	});

	it('does not reveal claims by other givers', () => {
		expect(viewClaim(bought, ctx({ viewerId: owner, revealedGiverIds: new Set([priya]) }))).toBeNull();
	});
});

describe('viewClaim — guests', () => {
	it('shows the claimer their own claim', () => {
		expect(viewClaim(buying, ctx({ viewerId: sam }))).toEqual({ status: 'buying', mine: true, byName: null });
	});

	it('names the claimer when they can see the list', () => {
		expect(viewClaim(bought, ctx())).toEqual({ status: 'bought', mine: false, byName: 'Sam' });
	});

	it('hides the claimer name when they cannot see the list', () => {
		expect(viewClaim(bought, ctx({ claimerCanSeeList: false }))).toEqual({
			status: 'bought',
			mine: false,
			byName: null
		});
	});

	it('shows anonymous viewers that an item is taken without a name leak beyond the rule', () => {
		expect(viewClaim(buying, ctx({ viewerId: null, claimerCanSeeList: false }))?.byName).toBeNull();
	});

	it('returns null when there is no claim', () => {
		expect(viewClaim(null, ctx())).toBeNull();
	});
});

describe('summariseClaims', () => {
	const ann: RawClaim = { userId: 'ann', status: 'bought', name: 'Ann' };
	const sum = (claims: RawClaim[], quantity: number | null, over: Partial<ClaimContext> = {}) =>
		summariseClaims(claims, quantity, () => ctx(over));

	it('is empty and open with no claims', () => {
		expect(sum([], 1)).toEqual({ mine: null, others: [], quantity: 1, full: false });
	});

	it('is full for guests once every one wanted is claimed, counting their own', () => {
		expect(sum([buying], 2).full).toBe(false);
		expect(sum([buying, ann], 2)).toEqual({
			mine: null,
			others: [
				{ status: 'buying', byName: 'Sam' },
				{ status: 'bought', byName: 'Ann' }
			],
			quantity: 2,
			full: true
		});
		expect(sum([buying, ann], 2, { viewerId: sam })).toMatchObject({ mine: { status: 'buying' }, others: [{ byName: 'Ann' }], full: true });
	});

	it('is never full when any number is fine', () => {
		expect(sum([buying, ann], null).full).toBe(false);
	});

	it('never tells the owner it is full, and only shows them revealed bought claims', () => {
		const v = sum([buying, ann], 2, { viewerId: owner, revealedGiverIds: new Set(['ann', sam]) });
		expect(v).toEqual({ mine: null, others: [{ status: 'bought', byName: 'Ann' }], quantity: 2, full: false });
		expect(sum([bought], 1, { viewerId: owner })).toEqual({ mine: null, others: [], quantity: 1, full: false });
	});
});
