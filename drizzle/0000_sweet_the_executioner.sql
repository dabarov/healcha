CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`activity_type` text,
	`duration_minutes` real,
	`avg_hr` real,
	`calories` real,
	`azm` integer,
	`hr_zones` text,
	`source` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `idx_activities_date` ON `activities` (`date`);--> statement-breakpoint
CREATE TABLE `ai_query_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`question` text NOT NULL,
	`generated_sql` text,
	`row_count` integer,
	`answer` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `daily_summaries` (
	`date` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `heart_rate_intraday` (
	`ts` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`bpm` integer NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE INDEX `idx_hr_intraday_date` ON `heart_rate_intraday` (`date`);--> statement-breakpoint
CREATE TABLE `hrv_readings` (
	`ts` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`rmssd` real
);
--> statement-breakpoint
CREATE INDEX `idx_hrv_readings_date` ON `hrv_readings` (`date`);--> statement-breakpoint
CREATE TABLE `irregular_rhythm_events` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`window_start` text,
	`window_end` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `idx_irn_date` ON `irregular_rhythm_events` (`date`);--> statement-breakpoint
CREATE TABLE `metrics_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`resting_hr` real,
	`hrv` real,
	`deep_sleep_hrv` real,
	`spo2` real,
	`resp_rate` real,
	`skin_temp_delta` real,
	`sleep_score` real,
	`sleep_minutes` real,
	`deep_minutes` real,
	`rem_minutes` real,
	`light_minutes` real,
	`awake_minutes` real,
	`sleep_efficiency` real,
	`bedtime` text,
	`wake_time` text,
	`steps` integer,
	`distance_meters` real,
	`azm` integer,
	`calories_total` real,
	`calories_active` real,
	`readiness` real,
	`irregular_rhythm_alerts` integer,
	`resting_hr_base` real,
	`resting_hr_z` real,
	`hrv_base` real,
	`hrv_z` real,
	`sleep_score_base` real,
	`sleep_score_z` real,
	`sleep_minutes_base` real,
	`sleep_minutes_z` real,
	`steps_base` real,
	`steps_z` real,
	`resp_rate_base` real,
	`resp_rate_z` real,
	`readiness_base` real,
	`readiness_z` real,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_metrics_daily_date` ON `metrics_daily` (`date`);--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`access_token` text,
	`access_token_expires_at` text,
	`refresh_token_enc` text,
	`scope` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `sleep_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`sleep_type` text,
	`minutes_asleep` real,
	`minutes_awake` real,
	`deep_minutes` real,
	`light_minutes` real,
	`rem_minutes` real,
	`efficiency` real,
	`stages` text
);
--> statement-breakpoint
CREATE INDEX `idx_sleep_sessions_date` ON `sleep_sessions` (`date`);--> statement-breakpoint
CREATE TABLE `spo2_intraday` (
	`ts` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`percentage` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_spo2_intraday_date` ON `spo2_intraday` (`date`);--> statement-breakpoint
CREATE TABLE `steps_intraday` (
	`ts` text PRIMARY KEY NOT NULL,
	`end_ts` text,
	`date` text NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_steps_intraday_date` ON `steps_intraday` (`date`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`data_type` text PRIMARY KEY NOT NULL,
	`last_synced_through` text,
	`last_run_at` text,
	`last_status` text,
	`last_error` text
);
