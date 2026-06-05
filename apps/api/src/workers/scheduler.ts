import { Queue, Worker, Job } from 'bullmq';
import prisma from '../utils/prisma';
import { sendEmail, deadlineReminderHtml, overdueAlertHtml } from '../services/email';
import { NotificationType, TaskStatus } from '@prisma/client';
import logger from '../utils/logger';

const REMINDER_WINDOWS_HOURS = [48, 24, 12, 1];

const NOTIFICATION_TYPE_MAP: Record<number, NotificationType> = {
  48: NotificationType.DEADLINE_48H,
  24: NotificationType.DEADLINE_24H,
  12: NotificationType.DEADLINE_12H,
  1:  NotificationType.DEADLINE_1H,
};

// Pass plain connection options so BullMQ uses its own bundled ioredis — avoids version mismatch
function redisOpts() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null as null,
  };
}

export const emailQueue = new Queue('email', {
  connection: redisOpts(),
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});

export const scanQueue = new Queue('deadline-scan', {
  connection: redisOpts(),
});

export async function startScheduler() {
  // Repeatable scan job every 30 minutes
  await scanQueue.add(
    'scan',
    {},
    {
      repeat: { pattern: '*/30 * * * *' },
      jobId: 'deadline-scan-repeatable',
    }
  );

  const scanWorker = new Worker(
    'deadline-scan',
    async () => {
      logger.info('Running deadline scan...');
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

  scanWorker.on('failed', (job, err) => logger.error(`Scan job ${job?.id} failed`, err));
  emailWorker.on('failed', (job, err) => logger.error(`Email job ${job?.id} failed`, err));

  logger.info('Scheduler started');

  // Run once immediately on startup
  await scanAndEnqueueReminders();
}

async function scanAndEnqueueReminders() {
  const now = new Date();

  // --- Deadline reminders ---
  for (const hours of REMINDER_WINDOWS_HOURS) {
    const windowStart = new Date(now.getTime() + (hours - 1) * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + (hours + 1) * 60 * 60 * 1000);
    const notifType   = NOTIFICATION_TYPE_MAP[hours];

    const tasks = await prisma.task.findMany({
      where: {
        deadline: { gte: windowStart, lte: windowEnd },
        status: { notIn: [TaskStatus.COMPLETED] },
      },
      include: {
        project: true,
        assignments: { include: { user: true } },
      },
    });

    for (const task of tasks) {
      for (const assignment of task.assignments) {
        const employee = assignment.user;

        // Idempotency: skip if already notified
        const existing = await prisma.notification.findUnique({
          where: { userId_taskId_type: { userId: employee.id, taskId: task.id, type: notifType } },
        });
        if (existing) continue;

        await prisma.notification.create({
          data: {
            userId: employee.id,
            taskId: task.id,
            type: notifType,
            message: `Task "${task.name}" is due in ${hours}h`,
          },
        });

        await emailQueue.add('send-reminder', {
          to: employee.email,
          subject: `[Reminder] Task due in ${hours}h: ${task.name}`,
          html: deadlineReminderHtml({
            employeeName: employee.name,
            taskName: task.name,
            projectName: task.project.name,
            deadline: task.deadline,
            hoursLeft: hours,
          }),
        });
      }
    }
  }

  // --- Overdue alerts ---
  const overdueTasks = await prisma.task.findMany({
    where: {
      deadline: { lt: now },
      status: { notIn: [TaskStatus.COMPLETED] },
    },
    include: {
      project: { include: { manager: true } },
      assignments: { include: { user: true } },
    },
  });

  for (const task of overdueTasks) {
    const pm = task.project.manager;

    for (const assignment of task.assignments) {
      const employee = assignment.user;

      const alreadySent = await prisma.notification.findUnique({
        where: { userId_taskId_type: { userId: employee.id, taskId: task.id, type: NotificationType.OVERDUE } },
      });
      if (alreadySent) continue;

      // Notify employee
      await prisma.notification.create({
        data: {
          userId: employee.id,
          taskId: task.id,
          type: NotificationType.OVERDUE,
          message: `Task "${task.name}" is overdue`,
        },
      });
      await emailQueue.add('overdue-employee', {
        to: employee.email,
        subject: `[Overdue] Task "${task.name}" is past its deadline`,
        html: overdueAlertHtml({
          recipientName: employee.name,
          taskName: task.name,
          projectName: task.project.name,
          deadline: task.deadline,
          role: 'employee',
        }),
      });

      // Notify PM (idempotent — check before creating)
      const pmAlreadySent = await prisma.notification.findFirst({
        where: { userId: pm.id, taskId: task.id, type: NotificationType.OVERDUE },
      });
      if (!pmAlreadySent) {
        await prisma.notification.create({
          data: {
            userId: pm.id,
            taskId: task.id,
            type: NotificationType.OVERDUE,
            message: `Employee task "${task.name}" is overdue`,
          },
        });
        await emailQueue.add(`overdue-pm-${pm.id}-${task.id}`, {
          to: pm.email,
          subject: `[Overdue Alert] Task "${task.name}" by ${employee.name}`,
          html: overdueAlertHtml({
            recipientName: pm.name,
            taskName: task.name,
            projectName: task.project.name,
            deadline: task.deadline,
            role: 'manager',
          }),
        });
      }
    }
  }

  logger.info(`Deadline scan complete. Overdue tasks found: ${overdueTasks.length}`);
}
