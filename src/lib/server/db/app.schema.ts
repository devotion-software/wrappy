import {
	mysqlTable,
	varchar,
	text,
	timestamp,
	boolean,
	int,
	decimal,
	char,
	date,
	mysqlEnum,
	index,
	primaryKey,
	uniqueIndex,
	bigint
} from 'drizzle-orm/mysql-core';
import { user } from './auth.schema';

const id = (name = 'id') => varchar(name, { length: 22 });
const userRef = (name: string) => varchar(name, { length: 36 });
const created = () => timestamp('created_at', { fsp: 3 }).defaultNow().notNull();

// ── Lists & items ────────────────────────────────────────────────────────────

export const list = mysqlTable(
	'list',
	{
		id: id().primaryKey(),
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 120 }).notNull(),
		description: text('description'),
		eventDate: date('event_date', { mode: 'string' }),
		// public = discoverable on the owner's profile; private = invite / secret link only.
		visibility: mysqlEnum('visibility', ['public', 'private']).default('private').notNull(),
		// Secret link token. Rotating it revokes everyone who joined through the old link.
		shareToken: varchar('share_token', { length: 40 }).unique(),
		// Set when this is a member's wish list for a Secret Santa exchange.
		santaId: id('santa_id'),
		createdAt: created(),
		updatedAt: timestamp('updated_at', { fsp: 3 })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(t) => [index('list_owner_idx').on(t.ownerId), index('list_santa_idx').on(t.santaId)]
);

/** Items belong to a user and can appear on any number of their lists (via item_list). */
export const item = mysqlTable(
	'item',
	{
		id: id().primaryKey(),
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 200 }).notNull(),
		notes: text('notes'),
		price: decimal('price', { precision: 10, scale: 2 }),
		currency: char('currency', { length: 3 }).default('GBP').notNull(),
		mostWanted: boolean('most_wanted').default(false).notNull(),
		createdAt: created(),
		updatedAt: timestamp('updated_at', { fsp: 3 })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(t) => [index('item_owner_idx').on(t.ownerId)]
);

export const itemList = mysqlTable(
	'item_list',
	{
		listId: id('list_id')
			.notNull()
			.references(() => list.id, { onDelete: 'cascade' }),
		itemId: id('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'cascade' }),
		sortOrder: int('sort_order').default(0).notNull(),
		addedAt: timestamp('added_at', { fsp: 3 }).defaultNow().notNull()
	},
	(t) => [primaryKey({ columns: [t.listId, t.itemId] }), index('item_list_item_idx').on(t.itemId)]
);

export const itemLink = mysqlTable(
	'item_link',
	{
		id: id().primaryKey(),
		itemId: id('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'cascade' }),
		url: varchar('url', { length: 2048 }).notNull(),
		label: varchar('label', { length: 200 }),
		sortOrder: int('sort_order').default(0).notNull(),
		createdAt: created()
	},
	(t) => [index('item_link_item_idx').on(t.itemId)]
);

export const itemImage = mysqlTable(
	'item_image',
	{
		id: id().primaryKey(),
		itemId: id('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'cascade' }),
		source: mysqlEnum('source', ['upload', 'link']).notNull(),
		// The link this image was fetched from, so deleting the link can offer to remove it.
		linkId: id('link_id'),
		// Storage key prefix; variants live at `${key}-thumb.webp` and `${key}-large.webp`.
		storageKey: varchar('storage_key', { length: 200 }).notNull(),
		width: int('width'),
		height: int('height'),
		alt: varchar('alt', { length: 200 }),
		// Lowest sort order is the cover image.
		sortOrder: int('sort_order').default(0).notNull(),
		createdAt: created()
	},
	(t) => [index('item_image_item_idx').on(t.itemId)]
);

// ── Sharing ──────────────────────────────────────────────────────────────────

/** Private-list invites by email. userId is filled once someone with that email signs in. */
export const listShare = mysqlTable(
	'list_share',
	{
		id: id().primaryKey(),
		listId: id('list_id')
			.notNull()
			.references(() => list.id, { onDelete: 'cascade' }),
		email: varchar('email', { length: 255 }).notNull(),
		userId: userRef('user_id').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: created()
	},
	(t) => [
		uniqueIndex('list_share_list_email_uq').on(t.listId, t.email),
		index('list_share_email_idx').on(t.email),
		index('list_share_user_idx').on(t.userId)
	]
);

/** Signed-in people who have opened a list. viaLink rows grant access to private lists. */
export const listViewer = mysqlTable(
	'list_viewer',
	{
		listId: id('list_id')
			.notNull()
			.references(() => list.id, { onDelete: 'cascade' }),
		userId: userRef('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		viaLink: boolean('via_link').default(false).notNull(),
		firstViewedAt: timestamp('first_viewed_at', { fsp: 3 }).defaultNow().notNull(),
		lastViewedAt: timestamp('last_viewed_at', { fsp: 3 }).defaultNow().notNull()
	},
	(t) => [primaryKey({ columns: [t.listId, t.userId] }), index('list_viewer_user_idx').on(t.userId)]
);

// ── Gifting ──────────────────────────────────────────────────────────────────

/** One claimer per item. Applies on every list the item is on. Never shown to the owner unless revealed. */
export const itemClaim = mysqlTable(
	'item_claim',
	{
		itemId: id('item_id')
			.primaryKey()
			.references(() => item.id, { onDelete: 'cascade' }),
		userId: userRef('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: mysqlEnum('status', ['buying', 'bought']).notNull(),
		updatedAt: timestamp('updated_at', { fsp: 3 })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(t) => [index('item_claim_user_idx').on(t.userId)]
);

/** "This would be good for X to get for me." */
export const itemSuggestion = mysqlTable('item_suggestion', {
	itemId: id('item_id')
		.primaryKey()
		.references(() => item.id, { onDelete: 'cascade' }),
	userId: userRef('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: created()
});

/** Owner has received presents from giver → giver's Bought claims become visible to the owner. */
export const receivedFrom = mysqlTable(
	'received_from',
	{
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		giverId: userRef('giver_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: created()
	},
	(t) => [primaryKey({ columns: [t.ownerId, t.giverId] })]
);

/**
 * People who gave the owner presents but don't have an account (e.g. "Grandma Jo").
 * Owner-defined and private to the owner.
 */
export const giftContact = mysqlTable(
	'gift_contact',
	{
		id: id().primaryKey(),
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 80 }).notNull(),
		createdAt: created()
	},
	(t) => [uniqueIndex('gift_contact_owner_name_uq').on(t.ownerId, t.name)]
);

/**
 * Presents the owner noted themselves — things a giver gave them that weren't on any list.
 * The giver is either an account (giverId) or one of the owner's contacts (contactId).
 * Private to the owner; givers never see these.
 */
export const receivedGift = mysqlTable(
	'received_gift',
	{
		id: id().primaryKey(),
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		giverId: userRef('giver_id').references(() => user.id, { onDelete: 'cascade' }),
		contactId: id('contact_id').references(() => giftContact.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 200 }).notNull(),
		createdAt: created()
	},
	(t) => [
		index('received_gift_owner_giver_idx').on(t.ownerId, t.giverId),
		index('received_gift_contact_idx').on(t.contactId)
	]
);

/**
 * The owner's private correction of who a bought wish was really from
 * ("Mum ticked off the scarf, but Granny bought it"). The claim itself is untouched,
 * so the person who claimed it never sees this. Points at an account or a contact.
 */
export const giftAttribution = mysqlTable('gift_attribution', {
	itemId: id('item_id')
		.primaryKey()
		.references(() => item.id, { onDelete: 'cascade' }),
	ownerId: userRef('owner_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	giverId: userRef('giver_id').references(() => user.id, { onDelete: 'cascade' }),
	contactId: id('contact_id').references(() => giftContact.id, { onDelete: 'cascade' }),
	createdAt: created()
});

/**
 * Who the owner has said thank you to. `personId` is an account's user id or a contact's id
 * (they never collide; see server/gifts.ts). Private to the owner. No FK on personId because it
 * can point at either table; rows for a deleted contact are removed with it in deleteContact.
 */
export const giftThanks = mysqlTable(
	'gift_thanks',
	{
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		personId: varchar('person_id', { length: 36 }).notNull(),
		thankedAt: timestamp('thanked_at', { fsp: 3 }).defaultNow().notNull()
	},
	(t) => [primaryKey({ columns: [t.ownerId, t.personId] })]
);

// ── Secret Santa ─────────────────────────────────────────────────────────────

export const santa = mysqlTable(
	'santa',
	{
		id: id().primaryKey(),
		ownerId: userRef('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 120 }).notNull(),
		description: text('description'),
		priceLimit: decimal('price_limit', { precision: 10, scale: 2 }),
		currency: char('currency', { length: 3 }).default('GBP').notNull(),
		exchangeDate: date('exchange_date', { mode: 'string' }),
		joinToken: varchar('join_token', { length: 40 }).notNull().unique(),
		status: mysqlEnum('status', ['open', 'drawn']).default('open').notNull(),
		drawnAt: timestamp('drawn_at', { fsp: 3 }),
		createdAt: created()
	},
	(t) => [index('santa_owner_idx').on(t.ownerId)]
);

export const santaMember = mysqlTable(
	'santa_member',
	{
		santaId: id('santa_id')
			.notNull()
			.references(() => santa.id, { onDelete: 'cascade' }),
		userId: userRef('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		// This member's wish list for the exchange (a normal list with santaId set).
		listId: id('list_id').references(() => list.id, { onDelete: 'set null' }),
		// Who this member is buying for. Private to this member.
		assignedToId: userRef('assigned_to_id').references(() => user.id, { onDelete: 'set null' }),
		joinedAt: timestamp('joined_at', { fsp: 3 }).defaultNow().notNull()
	},
	(t) => [primaryKey({ columns: [t.santaId, t.userId] }), index('santa_member_user_idx').on(t.userId)]
);

/** Pairs who must not draw each other (applies both ways). */
export const santaExclusion = mysqlTable(
	'santa_exclusion',
	{
		santaId: id('santa_id')
			.notNull()
			.references(() => santa.id, { onDelete: 'cascade' }),
		userA: userRef('user_a')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		userB: userRef('user_b')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.santaId, t.userA, t.userB] })]
);

// ── Rate limits ──────────────────────────────────────────────────────────────

/** Fixed-window usage counters for our own limits (see server/rateLimit.ts). Shared by every app instance. */
export const rateBucket = mysqlTable('rate_bucket', {
	key: varchar('bucket_key', { length: 191 }).primaryKey(),
	windowStart: bigint('window_start', { mode: 'number' }).notNull(),
	used: int('used').notNull()
});
