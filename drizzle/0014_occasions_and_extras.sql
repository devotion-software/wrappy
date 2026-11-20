CREATE TABLE `list_extra` (
	`id` varchar(22) NOT NULL,
	`list_id` varchar(22) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`occasion_id` varchar(22),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `list_extra_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `list_occasion` (
	`id` varchar(22) NOT NULL,
	`list_id` varchar(22) NOT NULL,
	`name` varchar(80) NOT NULL,
	`occasion_date` date NOT NULL,
	`opened_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `list_occasion_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `item_claim` ADD `occasion_id` varchar(22);--> statement-breakpoint
ALTER TABLE `list_extra` ADD CONSTRAINT `list_extra_list_id_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_extra` ADD CONSTRAINT `list_extra_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_occasion` ADD CONSTRAINT `list_occasion_list_id_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `list_extra_list_idx` ON `list_extra` (`list_id`);--> statement-breakpoint
CREATE INDEX `list_extra_user_idx` ON `list_extra` (`user_id`);--> statement-breakpoint
CREATE INDEX `list_occasion_list_idx` ON `list_occasion` (`list_id`);