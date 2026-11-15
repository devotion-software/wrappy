CREATE TABLE `gift_contact` (
	`id` varchar(22) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `gift_contact_id` PRIMARY KEY(`id`),
	CONSTRAINT `gift_contact_owner_name_uq` UNIQUE(`owner_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `received_gift` MODIFY COLUMN `giver_id` varchar(36);--> statement-breakpoint
ALTER TABLE `received_gift` ADD `contact_id` varchar(22);--> statement-breakpoint
ALTER TABLE `gift_contact` ADD CONSTRAINT `gift_contact_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `received_gift` ADD CONSTRAINT `received_gift_contact_id_gift_contact_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `gift_contact`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `received_gift_contact_idx` ON `received_gift` (`contact_id`);