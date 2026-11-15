CREATE TABLE `rate_limit` (
	`id` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`count` int NOT NULL,
	`last_request` bigint NOT NULL,
	CONSTRAINT `rate_limit_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `rate_bucket` (
	`bucket_key` varchar(191) NOT NULL,
	`window_start` bigint NOT NULL,
	`used` int NOT NULL,
	CONSTRAINT `rate_bucket_bucket_key` PRIMARY KEY(`bucket_key`)
);
