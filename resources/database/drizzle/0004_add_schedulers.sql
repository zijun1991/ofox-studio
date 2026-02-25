--> statement-breakpoint
CREATE TABLE `schedulers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`cron_expression` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai',
	`message_content` text NOT NULL,
	`enabled` integer DEFAULT 1,
	`last_run_at` text,
	`next_run_at` text,
	`created_by` text DEFAULT 'ai',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

--> statement-breakpoint
CREATE INDEX `idx_schedulers_enabled` ON `schedulers` (`enabled`);

--> statement-breakpoint
CREATE INDEX `idx_schedulers_next_run` ON `schedulers` (`next_run_at`);

--> statement-breakpoint
CREATE INDEX `idx_schedulers_agent_id` ON `schedulers` (`agent_id`);

--> statement-breakpoint
CREATE TABLE `scheduler_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheduler_id` text NOT NULL,
	`triggered_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`message_sent` integer DEFAULT 0,
	`error_message` text,
	`response_preview` text,
	`duration_ms` integer,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE INDEX `idx_scheduler_logs_scheduler_id` ON `scheduler_logs` (`scheduler_id`);

--> statement-breakpoint
CREATE INDEX `idx_scheduler_logs_status` ON `scheduler_logs` (`status`);

--> statement-breakpoint
CREATE INDEX `idx_scheduler_logs_triggered_at` ON `scheduler_logs` (`triggered_at`);
