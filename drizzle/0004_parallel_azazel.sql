CREATE TABLE `gift_attribution` (
	`item_id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`giver_id` varchar(36),
	`contact_id` varchar(22),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `gift_attribution_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
ALTER TABLE `gift_attribution` ADD CONSTRAINT `gift_attribution_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift_attribution` ADD CONSTRAINT `gift_attribution_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift_attribution` ADD CONSTRAINT `gift_attribution_giver_id_user_id_fk` FOREIGN KEY (`giver_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift_attribution` ADD CONSTRAINT `gift_attribution_contact_id_gift_contact_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `gift_contact`(`id`) ON DELETE cascade ON UPDATE no action;