CREATE TABLE `email_pref` (
	`user_id` varchar(36) NOT NULL,
	`list_reminders` boolean NOT NULL DEFAULT true,
	`buying_reminders` boolean NOT NULL DEFAULT true,
	`santa_reminders` boolean NOT NULL DEFAULT true,
	CONSTRAINT `email_pref_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `reminder_sent` (
	`kind` enum('list','buying','santa') NOT NULL,
	`subject_key` varchar(80) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `reminder_sent_kind_subject_key_user_id_pk` PRIMARY KEY(`kind`,`subject_key`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `email_pref` ADD CONSTRAINT `email_pref_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminder_sent` ADD CONSTRAINT `reminder_sent_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;