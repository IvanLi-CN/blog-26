-- Keep the newest in-flight scheduler record for each job before enforcing the
-- single-flight invariant. Older records can remain after an abrupt shutdown.
UPDATE `job_runs`
SET
	`status` = 'error',
	`finished_at` = COALESCE(`finished_at`, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	`error_message` = '迁移时回收了重复的未完成任务'
WHERE `status` = 'running'
	AND `id` NOT IN (
		SELECT current_run.`id`
		FROM `job_runs` AS current_run
		WHERE current_run.`status` = 'running'
			AND NOT EXISTS (
				SELECT 1
				FROM `job_runs` AS newer_run
				WHERE newer_run.`status` = 'running'
					AND newer_run.`job_key` = current_run.`job_key`
					AND (
						newer_run.`started_at` > current_run.`started_at`
						OR (
							newer_run.`started_at` = current_run.`started_at`
							AND newer_run.`id` > current_run.`id`
						)
					)
			)
	);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_uq_running_job` ON `job_runs` (`job_key`) WHERE "job_runs"."status" = 'running';
