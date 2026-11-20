import { describe, expect, it } from 'vitest';
import { isFull, revealedToOwner, summariseClaims, viewClaim, type ClaimContext, type RawClaim } from './claimView';

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
		summariseClaims(claims, { quantity, groupGift: false, price: null }, over.viewerId === owner, () => ctx(over));

	it('is empty and open with no claims', () => {
		expect(sum([], 1)).toEqual({ mine: null, others: [], quantity: 1, full: false, group: null });
	});

	it('is full for guests once every one wanted is claimed, counting their own', () => {
		expect(sum([buying], 2).full).toBe(false);
		expect(sum([buying, ann], 2)).toEqual({
			mine: null,
			others: [
				{ status: 'buying', byName: 'Sam', occasionId: null },
				{ status: 'bought', byName: 'Ann', occasionId: null }
			],
			quantity: 2,
			full: true,
			group: null
		});
		expect(sum([buying, ann], 2, { viewerId: sam })).toMatchObject({ mine: { status: 'buying' }, others: [{ byName: 'Ann' }], full: true });
	});

	it('is never full when any number is fine', () => {
		expect(sum([buying, ann], null).full).toBe(false);
	});

	it('never tells the owner it is full, and only shows them revealed bought claims', () => {
		const v = sum([buying, ann], 2, { viewerId: owner, revealedGiverIds: new Set(['ann', sam]) });
		expect(v).toEqual({ mine: null, others: [{ status: 'bought', byName: 'Ann' }], quantity: 2, full: false, group: null });
		expect(sum([bought], 1, { viewerId: owner })).toEqual({ mine: null, others: [], quantity: 1, full: false, group: null });
	});
});

describe('group gifts', () => {
	const gift = { quantity: 1, groupGift: true, price: '80.00' };
	const sam20: RawClaim = { userId: sam, status: 'buying', name: 'Sam', amount: '20.00' };
	const ann60: RawClaim = { userId: 'ann', status: 'bought', name: 'Ann', amount: '60.00' };

	it('is full once the amounts cover the price, however many people', () => {
		expect(isFull(gift, [sam20])).toBe(false);
		expect(isFull(gift, [sam20, ann60])).toBe(true);
		expect(isFull({ ...gift, price: null }, [sam20, ann60])).toBe(false);
		expect(isFull({ quantity: 2, groupGift: false, price: null }, [sam20, ann60])).toBe(true);
	});

	it('shows guests the total and each amount', () => {
		expect(summariseClaims([sam20], gift, false, () => ctx())).toEqual({
			mine: null,
			others: [{ status: 'buying', byName: 'Sam', amount: '20.00', occasionId: null }],
			quantity: 1,
			full: false,
			group: { target: '80.00', pledged: '20.00' }
		});
		expect(summariseClaims([sam20, ann60], gift, false, () => ctx({ viewerId: sam }))).toMatchObject({
			mine: { status: 'buying', amount: '20.00' },
			full: true,
			group: { pledged: '80.00' }
		});
	});

	it('never shows the owner amounts or the total, only revealed bought names', () => {
		const v = summariseClaims([sam20, ann60], gift, true, () => ctx({ viewerId: owner, revealedGiverIds: new Set([sam, 'ann']) }));
		expect(v).toEqual({ mine: null, others: [{ status: 'bought', byName: 'Ann' }], quantity: 1, full: false, group: { target: '80.00', pledged: null } });
		expect(JSON.stringify(v)).not.toContain('60');
	});
});

describe('occasions', () => {
	const birthday = 'occ-bday';
	const xmas = 'occ-xmas';
	const forBday: RawClaim = { userId: sam, status: 'bought', name: 'Sam', occasionId: birthday };
	const forXmas: RawClaim = { userId: sam, status: 'bought', name: 'Sam', occasionId: xmas };

	it('reveals an occasion present when its occasion is opened, not by "received from"', () => {
		expect(revealedToOwner(forBday, new Set([sam]), new Set())).toBe(false);
		expect(revealedToOwner(forBday, new Set(), new Set([birthday]))).toBe(true);
		expect(revealedToOwner({ userId: sam }, new Set([sam]), new Set([birthday]))).toBe(true);
		expect(revealedToOwner({ userId: sam }, new Set(), new Set([birthday]))).toBe(false);
	});

	it('opening the birthday does not spoil Christmas, even after "received from"', () => {
		const c = ctx({ viewerId: owner, revealedGiverIds: new Set([sam]), openedOccasionIds: new Set([birthday]) });
		expect(viewClaim(forBday, c)).toEqual({ status: 'bought', mine: false, byName: 'Sam' });
		expect(viewClaim(forXmas, c)).toBeNull();
		expect(viewClaim({ ...forBday, status: 'buying' }, c)).toBeNull();
	});

	it('tells guests which occasion, but not the owner', () => {
		const target = { quantity: 1, groupGift: false, price: null };
		expect(summariseClaims([forXmas], target, false, () => ctx()).others).toEqual([{ status: 'bought', byName: 'Sam', occasionId: xmas }]);
		expect(summariseClaims([forXmas], target, false, () => ctx({ viewerId: sam })).mine).toEqual({ status: 'bought', occasionId: xmas });
		const v = summariseClaims([forBday], target, true, () =>
			ctx({ viewerId: owner, openedOccasionIds: new Set([birthday]) })
		);
		expect(v.others).toEqual([{ status: 'bought', byName: 'Sam' }]);
	});
});
