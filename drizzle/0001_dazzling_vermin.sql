CREATE TABLE `item` (
	`id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`notes` text,
	`price` decimal(10,2),
	`currency` char(3) NOT NULL DEFAULT 'GBP',
	`most_wanted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_claim` (
	`item_id` varchar(22) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`status` enum('buying','bought') NOT NULL,
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `item_claim_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `item_image` (
	`id` varchar(22) NOT NULL,
	`item_id` varchar(22) NOT NULL,
	`source` enum('upload','link') NOT NULL,
	`link_id` varchar(22),
	`storage_key` varchar(200) NOT NULL,
	`width` int,
	`height` int,
	`alt` varchar(200),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `item_image_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_link` (
	`id` varchar(22) NOT NULL,
	`item_id` varchar(22) NOT NULL,
	`url` varchar(2048) NOT NULL,
	`label` varchar(200),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `item_link_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_list` (
	`list_id` varchar(22) NOT NULL,
	`item_id` varchar(22) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`added_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `item_list_list_id_item_id_pk` PRIMARY KEY(`list_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `item_suggestion` (
	`item_id` varchar(22) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `item_suggestion_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `list` (
	`id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`title` varchar(120) NOT NULL,
	`description` text,
	`event_date` date,
	`visibility` enum('public','private') NOT NULL DEFAULT 'private',
	`share_token` varchar(40),
	`santa_id` varchar(22),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `list_id` PRIMARY KEY(`id`),
	CONSTRAINT `list_share_token_unique` UNIQUE(`share_token`)
);
--> statement-breakpoint
CREATE TABLE `list_share` (
	`id` varchar(22) NOT NULL,
	`list_id` varchar(22) NOT NULL,
	`email` varchar(255) NOT NULL,
	`user_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `list_share_id` PRIMARY KEY(`id`),
	CONSTRAINT `list_share_list_email_uq` UNIQUE(`list_id`,`email`)
);
--> statement-breakpoint
CREATE TABLE `list_viewer` (
	`list_id` varchar(22) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`via_link` boolean NOT NULL DEFAULT false,
	`first_viewed_at` timestamp(3) NOT NULL DEFAULT (now()),
	`last_viewed_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `list_viewer_list_id_user_id_pk` PRIMARY KEY(`list_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `received_from` (
	`owner_id` varchar(36) NOT NULL,
	`giver_id` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `received_from_owner_id_giver_id_pk` PRIMARY KEY(`owner_id`,`giver_id`)
);
--> statement-breakpoint
CREATE TABLE `santa` (
	`id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`price_limit` decimal(10,2),
	`currency` char(3) NOT NULL DEFAULT 'GBP',
	`exchange_date` date,
	`join_token` varchar(40) NOT NULL,
	`status` enum('open','drawn') NOT NULL DEFAULT 'open',
	`drawn_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `santa_id` PRIMARY KEY(`id`),
	CONSTRAINT `santa_join_token_unique` UNIQUE(`join_token`)
);
--> statement-breakpoint
CREATE TABLE `santa_exclusion` (
	`santa_id` varchar(22) NOT NULL,
	`user_a` varchar(36) NOT NULL,
	`user_b` varchar(36) NOT NULL,
	CONSTRAINT `santa_exclusion_santa_id_user_a_user_b_pk` PRIMARY KEY(`santa_id`,`user_a`,`user_b`)
);
--> statement-breakpoint
CREATE TABLE `santa_member` (
	`santa_id` varchar(22) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`list_id` varchar(22),
	`assigned_to_id` varchar(36),
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `santa_member_santa_id_user_id_pk` PRIMARY KEY(`santa_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `username` varchar(30);--> statement-breakpoint
ALTER TABLE `user` ADD CONSTRAINT `user_username_unique` UNIQUE(`username`);--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_claim` ADD CONSTRAINT `item_claim_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_claim` ADD CONSTRAINT `item_claim_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_image` ADD CONSTRAINT `item_image_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_link` ADD CONSTRAINT `item_link_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_list` ADD CONSTRAINT `item_list_list_id_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_list` ADD CONSTRAINT `item_list_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_suggestion` ADD CONSTRAINT `item_suggestion_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_suggestion` ADD CONSTRAINT `item_suggestion_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list` ADD CONSTRAINT `list_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_share` ADD CONSTRAINT `list_share_list_id_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_share` ADD CONSTRAINT `list_share_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_viewer` ADD CONSTRAINT `list_viewer_list_id_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_viewer` ADD CONSTRAINT `list_viewer_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `received_from` ADD CONSTRAINT `received_from_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `received_from` ADD CONSTRAINT `received_from_giver_id_user_id_fk` FOREIGN KEY (`giver_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa` ADD CONSTRAINT `santa_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_exclusion` ADD CONSTRAINT `santa_exclusion_santa_id_santa_id_fk` FOREIGN KEY (`santa_id`) REFERENCES `santa`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_exclusion` ADD CONSTRAINT `santa_exclusion_user_a_user_id_fk` FOREIGN KEY (`user_a`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_exclusion` ADD CONSTRAINT `santa_exclusion_user_b_user_id_fk` FOREIGN KEY (`user_b`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_member` ADD CONSTRAINT `santa_member_santa_id_santa_id_fk` FOREIGN KEY (`santa_id`) REFERENCES `santa`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_member` ADD CONSTRAINT `santa_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_member` ADD CONSTRAINT `santa_member_list_id_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_member` ADD CONSTRAINT `santa_member_assigned_to_id_user_id_fk` FOREIGN KEY (`assigned_to_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `item_owner_idx` ON `item` (`owner_id`);--> statement-breakpoint
CREATE INDEX `item_claim_user_idx` ON `item_claim` (`user_id`);--> statement-breakpoint
CREATE INDEX `item_image_item_idx` ON `item_image` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_link_item_idx` ON `item_link` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_list_item_idx` ON `item_list` (`item_id`);--> statement-breakpoint
CREATE INDEX `list_owner_idx` ON `list` (`owner_id`);--> statement-breakpoint
CREATE INDEX `list_santa_idx` ON `list` (`santa_id`);--> statement-breakpoint
CREATE INDEX `list_share_email_idx` ON `list_share` (`email`);--> statement-breakpoint
CREATE INDEX `list_share_user_idx` ON `list_share` (`user_id`);--> statement-breakpoint
CREATE INDEX `list_viewer_user_idx` ON `list_viewer` (`user_id`);--> statement-breakpoint
CREATE INDEX `santa_owner_idx` ON `santa` (`owner_id`);--> statement-breakpoint
CREATE INDEX `santa_member_user_idx` ON `santa_member` (`user_id`);