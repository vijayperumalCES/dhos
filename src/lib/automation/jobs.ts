/** What each scheduled job does, in the words shown on the Scheduler page. Keys mirror scheduled_jobs.key. */
export const JOB_INFO: Record<string, { name: string; description: string }> = {
  escalation_overdue: { name: "Overdue escalations", description: "Raises an event once for each escalation past its response deadline." },
  timesheet_reminder: { name: "Timesheet reminders", description: "Reminds people who have not submitted last week's timesheet, from the second working day of the week." },
  sprint_snapshot: { name: "Sprint burndown snapshot", description: "Records today's scope and completed work for every active sprint so burndown has a point for quiet days." },
  integration_sync: { name: "Integration sync", description: "Pulls the status of linked external issues and announces changes." },
  retention: { name: "Retention", description: "Deletes processed events, finished deliveries and read notifications older than the retention window (30 / 90 days). The audit log is never touched." },
};
