CREATE TABLE `xtore_passages` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `xtore_passages_at` ON `xtore_passages` (`at`);