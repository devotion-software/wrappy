ALTER TABLE `item` ADD `quantity` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `item_claim` DROP PRIMARY KEY, ADD PRIMARY KEY(`item_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `gift_attribution` ADD `claimer_id` varchar(36);--> statement-breakpoint
UPDATE `gift_attribution` ga JOIN `item_claim` c ON c.`item_id` = ga.`item_id` SET ga.`claimer_id` = c.`user_id`;--> statement-breakpoint
DELETE FROM `gift_attribution` WHERE `claimer_id` IS NULL;--> statement-breakpoint
ALTER TABLE `gift_attribution` MODIFY `claimer_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `gift_attribution` DROP PRIMARY KEY, ADD PRIMARY KEY(`item_id`,`claimer_id`);--> statement-breakpoint
ALTER TABLE `gift_attribution` ADD CONSTRAINT `gift_attribution_claimer_id_user_id_fk` FOREIGN KEY (`claimer_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;
