CREATE TABLE `price_history` (
	`id` varchar(22) NOT NULL,
	`link_id` varchar(22) NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`currency` char(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `reminder_sent` MODIFY COLUMN `kind` enum('list','buying','santa','price') NOT NULL;--> statement-breakpoint
ALTER TABLE `email_pref` ADD `price_alerts` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `item_link` ADD `last_price` decimal(10,2);--> statement-breakpoint
ALTER TABLE `item_link` ADD `last_currency` char(3);--> statement-breakpoint
ALTER TABLE `item_link` ADD `checked_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_link_id_item_link_id_fk` FOREIGN KEY (`link_id`) REFERENCES `item_link`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `price_history_link_idx` ON `price_history` (`link_id`);--> statement-breakpoint
CREATE INDEX `item_link_checked_idx` ON `item_link` (`checked_at`);