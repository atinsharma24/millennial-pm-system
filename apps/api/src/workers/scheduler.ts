/**
 * @file workers/scheduler.ts
 * @description BullMQ-based deadline reminder and overdue-alert scheduler.
 *
 * ## How it works
 *
 * 1. **`deadline-scan` queue** — a single repeatable job runs on a 30-minute
 *    cron (`* /30 * * * *`).  On each tick it queries the database for tasks
 *    whose deadline falls within each of the four reminder windows (48 h, 24 h,
 *    12 h, 1 h ahead) and for tasks that are already past their deadline.
 *
 * 2. **`email` queue** — individual email-send jobs are enqueued by the scan
 *    worker.  A separate email worker processes them with retry logic
 *    (3 attempts, exponential back-off starting at 5 s).
 *
 * ## Idempotency
 *
 * Before enqueuing a reminder the scanner checks the `Notification` table for
 * a row matching `(userId, taskId, type)`.  This composite unique index means
 * even if the scan runs multiple times inside the same window, no duplicate
 * emails are sent.
 *
 * ## Real-time bridge
 *
 * After writing each `Notification` row the scheduler calls `emitToUser()` so
 * the frontend notification bell updates instantly without polling.
 *
 * ## Running locally without Redis
 *
 * Start Redis with `docker compose up redis -d`, then `npm run dev` in
 * `apps/api/`.  The scheduler starts automatically and logs its first scan.
 */

import { Queue, Worker, Job } from 'bullmq';
import prisma from '../utils/prisma';
import { sendEmail, deadlineReminderHtml, overdueAlertHtml } from '../services/email';
import { emitToUser } from '../utils/socket';
import { NotificationType, TaskStatus } from '@prisma/client';
import logger from '../utils/logger';

/** The four reminder windows in hours before deadline. */
const REMINDER_WINDOWS_HOURS = [48, 24, 12, 1] as const;

/** Maps reminder-window hours to the corresponding NotificationType enum value. */
const NOTIFICATION_TYPE_MAP: Record<number, NotificationType> = {
  48: NotificationType.DEADLINE_48H,
  24: NotificationType.DEADLINE_24H,
  12: NotificationType.DEADLINE_12H,
  1:  NotificationType.DEADLINE_1H,
};

/**
 * Builds plain Redis connection options.
 *
 * BullMQ bundles its own ioredis version, so we pass plain options rather than
 * an IORedis instance to avoid the type-compatibility conflict that arises when
 * the user-space `ioredis` package and BullMQ's bundled version differ in their
 * AbstractConnector type signature.
 */
function redisOpts() {
  return {
    host:     process.env.REDIS_HOST || 'localhost',
    port:     parseInt(process.env.REDIS_PORT || '6379'),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null as null,
  };
}

/**
 * Queue for individual email-send jobs.
 * Consumers retry up to 3 times with exponential back-off.
 */
export const emailQueue = new Queue('email', {
  connection: redisOpts(),
  defaultJobOptions: {
    attempts: 3,
    backoff:  { type: 'exponential', delay: 5_000 },
  },
});

/**
 * Queue for the repeatable database-scan job.
 * Only one job definition is stored here; the repeatable schedule does the rest.
 */
export const scanQueue = new Queue('deadline-scan', {
  connection: redisOpts(),
});

/**
 * Starts both the scan worker and the email worker and registers the
 * repeatable scan job (30-minute cron).
 *
 * Called once from `src/index.ts` after the server starts listening.
 * Not called in `NODE_ENV=test` to keep unit tests clean.
 */
export async function startScheduler(): Promise<void> {
  // Register the repeatable job — BullMQ deduplicates by jobId so calling this
  // on every restart is idempotent.
  await scanQueue.add(
    'scan',
    {},
    {
      repeat: { pattern: '*/30 * * * *' },
      jobId:  'deadline-scan-repeatable',
    }
  );

  const scanWorker = new Worker(
    'deadline-scan',
    async () => {
      logger.info('Deadline scan started');
      await scanAndEnqueueReminders();
    },
    { connection: redisOpts() }
  );

  const emailWorker = new Worker(
    'email',
    async (job: Job) => {
      const { to, subject, html } = job.data as { to: string; subject: string; html: string };
      await sendEmail({ to, subject, html });
    },
    { connection: redisOpts() }
  );

  scanWorker.on('failed',    (job, err) => logger.error(`Scan job ${job?.id} failed`, err));
  scanWorker.on('completed', ()         => logger.info('Deadline scan completed'));
  emailWorker.on('failed',   (job, err) => logger.error(`Email job ${job?.id} failed`, err));

  logger.info('Scheduler started — repeating every 30 minutes');

  // Fire immediately on first startup so there's no 30-min wait during dev
  await scanAndEnqueueReminders();
}

// ─── Core scan logic ──────────────────────────────────────────────────────────

/**
 * Main scan routine.  Queries for upcoming and overdue tasks, creates
 * `Notification` rows (idempotent), enqueues email jobs, and pushes
 * real-time events via Socket.IO.
 *
 * Exported separately so it can be unit-tested without a running Redis/BullMQ.
 */
export async function scanAndEnqueueReminders(): Promise<void> {
  const now = new Date();

  // ── Deadline reminders ────────────────────────────────────────────────────
  for (const hours of REMINDER_WINDOWS_HOURS) {
    const windowStart = new Date(now.getTime() + (hours - 1) * 3_600_000);
    const windowEnd   = new Date(now.getTime() + (hours + 1) * 3_600_000);
    const notifType   = NOTIFICATION_TYPE_MAP[hours];

    const tasks = await prisma.task.findMany({
      where: {
        deadline: { gte: windowStart, lte: windowEnd },
        status:   { notIn: [TaskStatus.COMPLETED] },
      },
      include: {
        project:     true,
        assignments: { include: { user: true } },
      },
    });

    if (tasks.length === 0) continue;

    // Batch fetch existing notifications for this window to avoid N+1 queries
    const taskIds = tasks.map((t) => t.id);
    const existingNotifs = await prisma.notification.findMany({
      where: { type: notifType, taskId: { in: taskIds } },
      select: { userId: true, taskId: true },
    });
    const existingSet = new Set(existingNotifs.map((n) => `${n.userId}-${n.taskId}`));

    for (const task of tasks) {
      for (const assignment of task.assignments) {
        const employee = assignment.user;

        // Idempotency check — skip if this exact (user, task, type) was already sent
        if (existingSet.has(`${employee.id}-${task.id}`)) continue;

        // Persist notification row
        const notif = await prisma.notification.create({
          data: {
            userId:  employee.id,
            taskId:  task.id,
            type:    notifType,
            message: `Task "${task.name}" is due in ${hours} hour${hours > 1 ? 's' : ''}`,
          },
        });

        // Push real-time event so the frontend bell updates immediately
        emitToUser(employee.id, 'notification:new', {
          id:      notif.id,
          type:    notifType,
          message: notif.message,
          taskId:  task.id,
          sentAt:  notif.sentAt,
        });

        // Enqueue email
        await emailQueue.add(`reminder-${hours}h-${employee.id}-${task.id}`, {
          to:      employee.email,
          subject: `[Reminder] Task due in ${hours}h: ${task.name}`,
          html:    deadlineReminderHtml({
            employeeName: employee.name,
            taskName:     task.name,
            projectName:  task.project.name,
            deadline:     task.deadline,
            hoursLeft:    hours,
          }),
        });

        logger.debug(`Enqueued ${hours}h reminder for ${employee.email} — task "${task.name}"`);
      }
    }
  }

  // ── Overdue alerts ────────────────────────────────────────────────────────
  const overdueTasks = await prisma.task.findMany({
    where: {
      deadline: { lt: now },
      status:   { notIn: [TaskStatus.COMPLETED] },
    },
    include: {
      project:     { include: { manager: true } },
      assignments: { include: { user: true } },
    },
  });

  if (overdueTasks.length > 0) {
    // Batch fetch existing overdue notifications
    const overdueTaskIds = overdueTasks.map((t) => t.id);
    const existingOverdue = await prisma.notification.findMany({
      where: { type: NotificationType.OVERDUE, taskId: { in: overdueTaskIds } },
      select: { userId: true, taskId: true },
    });
    const overdueSet = new Set(existingOverdue.map((n) => `${n.userId}-${n.taskId}`));

    for (const task of overdueTasks) {
      const pm = task.project.manager;

      for (const assignment of task.assignments) {
        const employee = assignment.user;

        // Guard: skip if employee was already notified overdue
        if (!overdueSet.has(`${employee.id}-${task.id}`)) {
        const empNotif = await prisma.notification.create({
          data: {
            userId:  employee.id,
            taskId:  task.id,
            type:    NotificationType.OVERDUE,
            message: `Task "${task.name}" is overdue`,
          },
        });

        emitToUser(employee.id, 'notification:new', {
          id: empNotif.id, type: NotificationType.OVERDUE,
          message: empNotif.message, taskId: task.id, sentAt: empNotif.sentAt,
        });

        await emailQueue.add(`overdue-emp-${employee.id}-${task.id}`, {
          to:      employee.email,
          subject: `[Overdue] Task "${task.name}" is past its deadline`,
          html:    overdueAlertHtml({
            recipientName: employee.name,
            taskName:      task.name,
            projectName:   task.project.name,
            deadline:      task.deadline,
            role:          'employee',
          }),
        });
      }

      // Guard: skip if PM was already notified overdue for this task
      if (!overdueSet.has(`${pm.id}-${task.id}`)) {
        const pmNotif = await prisma.notification.create({
          data: {
            userId:  pm.id,
            taskId:  task.id,
            type:    NotificationType.OVERDUE,
            message: `Employee task "${task.name}" (${employee.name}) is overdue`,
          },
        });

        emitToUser(pm.id, 'notification:new', {
          id: pmNotif.id, type: NotificationType.OVERDUE,
          message: pmNotif.message, taskId: task.id, sentAt: pmNotif.sentAt,
        });

        await emailQueue.add(`overdue-pm-${pm.id}-${task.id}`, {
          to:      pm.email,
          subject: `[Overdue Alert] Task "${task.name}" by ${employee.name}`,
          html:    overdueAlertHtml({
            recipientName: pm.name,
            taskName:      task.name,
            projectName:   task.project.name,
            deadline:      task.deadline,
            role:          'manager',
          }),
        });
      }
    }
  }
  logger.info(
    `Scan complete — overdue: ${overdueTasks.length}, ` +
    `windows checked: ${REMINDER_WINDOWS_HOURS.join('h, ')}h`
  );
}
