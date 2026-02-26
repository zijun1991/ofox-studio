--> statement-breakpoint
ALTER TABLE `schedulers` ADD COLUMN `close_on_trigger` integer DEFAULT 0;

--> statement-breakpoint
ALTER TABLE `schedulers` ADD COLUMN `delete_on_trigger` integer DEFAULT 0;
