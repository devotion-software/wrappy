CREATE TABLE `santa_message` (
	`id` varchar(22) NOT NULL,
	`santa_id` varchar(22) NOT NULL,
	`giver_id` varchar(36) NOT NULL,
	`recipient_id` varchar(36) NOT NULL,
	`from_giver` boolean NOT NULL,
	`body` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `santa_message_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `santa_message` ADD CONSTRAINT `santa_message_santa_id_santa_id_fk` FOREIGN KEY (`santa_id`) REFERENCES `santa`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_message` ADD CONSTRAINT `santa_message_giver_id_user_id_fk` FOREIGN KEY (`giver_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `santa_message` ADD CONSTRAINT `santa_message_recipient_id_user_id_fk` FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `santa_message_giver_idx` ON `santa_message` (`santa_id`,`giver_id`);--> statement-breakpoint
CREATE INDEX `santa_message_recipient_idx` ON `santa_message` (`santa_id`,`recipient_id`);