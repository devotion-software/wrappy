CREATE TABLE `gift_thanks` (
	`owner_id` varchar(36) NOT NULL,
	`person_id` varchar(36) NOT NULL,
	`thanked_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `gift_thanks_owner_id_person_id_pk` PRIMARY KEY(`owner_id`,`person_id`)
);
--> statement-breakpoint
ALTER TABLE `gift_thanks` ADD CONSTRAINT `gift_thanks_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;