CREATE TABLE `friend_group` (
	`id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`join_token` varchar(40) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_group_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_group_join_token_unique` UNIQUE(`join_token`)
);
--> statement-breakpoint
CREATE TABLE `friend_group_member` (
	`group_id` varchar(22) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_group_member_group_id_user_id_pk` PRIMARY KEY(`group_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `list_share` ADD `group_id` varchar(22);--> statement-breakpoint
ALTER TABLE `friend_group` ADD CONSTRAINT `friend_group_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `friend_group_member` ADD CONSTRAINT `friend_group_member_group_id_friend_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `friend_group`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `friend_group_member` ADD CONSTRAINT `friend_group_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `friend_group_owner_idx` ON `friend_group` (`owner_id`);--> statement-breakpoint
CREATE INDEX `friend_group_member_user_idx` ON `friend_group_member` (`user_id`);--> statement-breakpoint
ALTER TABLE `list_share` ADD CONSTRAINT `list_share_group_id_friend_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `friend_group`(`id`) ON DELETE set null ON UPDATE no action;