CREATE TABLE `received_gift` (
	`id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`giver_id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `received_gift_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `received_gift` ADD CONSTRAINT `received_gift_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `received_gift` ADD CONSTRAINT `received_gift_giver_id_user_id_fk` FOREIGN KEY (`giver_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `received_gift_owner_giver_idx` ON `received_gift` (`owner_id`,`giver_id`);