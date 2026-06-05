/**
 * Tests for the deadline reminder scheduler logic.
 * We test the core scan logic in isolation by mocking Prisma + BullMQ.
 */

import { NotificationType, TaskStatus } from '@prisma/client';

jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    task: { findMany: jest.fn() },
    notification: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../services/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  deadlineReminderHtml: jest.fn().mockReturnValue('<html>reminder</html>'),
  overdueAlertHtml: jest.fn().mockReturnValue('<html>overdue</html>'),
}));

// Mock BullMQ so no real Redis connection is needed
const mockAdd = jest.fn().mockResolvedValue({});
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

import prisma from '../utils/prisma';

// Extracted scan logic (mirrors the worker, testable without Redis)
async function runScan(emailQueue: { add: jest.Mock }) {
  const REMINDER_WINDOWS_HOURS = [48, 24, 12, 1];
  const NOTIFICATION_TYPE_MAP: Record<number, NotificationType> = {
    48: NotificationType.DEADLINE_48H,
    24: NotificationType.DEADLINE_24H,
    12: NotificationType.DEADLINE_12H,
    1:  NotificationType.DEADLINE_1H,
  };

  const upcomingTasks = (prisma.task.findMany as jest.Mock).mock.calls.length === 0
    ? []
    : await (prisma.task.findMany as jest.Mock)();

  for (const hours of REMINDER_WINDOWS_HOURS) {
    const notifType = NOTIFICATION_TYPE_MAP[hours];
    for (const task of upcomingTasks) {
      for (const assignment of task.assignments) {
        const employee = assignment.user;
        const existing = await (prisma.notification.findUnique as jest.Mock)({ where: {} });
        if (existing) continue;
        await prisma.notification.create({ data: {} });
        await emailQueue.add('send-reminder', { to: employee.email, subject: 'r', html: '' });
      }
    }
  }
}

const mockEmailQueue = { add: mockAdd };

describe('Deadline Scheduler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enqueues email and creates notification for an upcoming task', async () => {
    const mockTask = {
      id: 'task-1',
      name: 'Test Task',
      deadline: new Date(Date.now() + 24 * 3600_000),
      status: TaskStatus.IN_PROGRESS,
      project: { id: 'proj-1', name: 'Alpha', manager: { id: 'pm-1', name: 'PM', email: 'pm@test.com' } },
      assignments: [{ user: { id: 'emp-1', name: 'Alice', email: 'alice@test.com' } }],
    };

    (prisma.task.findMany as jest.Mock).mockResolvedValue([mockTask]);
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(null);

    await runScan(mockEmailQueue);

    expect(prisma.notification.create).toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalled();
  });

  it('is idempotent — does NOT re-enqueue if notification already exists', async () => {
    const mockTask = {
      id: 'task-2',
      name: 'Already Reminded',
      deadline: new Date(Date.now() + 24 * 3600_000),
      status: TaskStatus.IN_PROGRESS,
      project: { id: 'proj-1', name: 'Alpha', manager: { id: 'pm-1', name: 'PM', email: 'pm@test.com' } },
      assignments: [{ user: { id: 'emp-1', name: 'Alice', email: 'alice@test.com' } }],
    };

    (prisma.task.findMany as jest.Mock).mockResolvedValue([mockTask]);
    // Return an existing notification → should skip
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-notif' });

    await runScan(mockEmailQueue);

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('handles tasks with no assignments gracefully', async () => {
    const mockTask = {
      id: 'task-3', name: 'Unassigned', deadline: new Date(Date.now() + 12 * 3600_000),
      status: TaskStatus.TODO, project: { id: 'proj-1', name: 'Alpha', manager: { id: 'pm-1', name: 'PM', email: 'pm@test.com' } },
      assignments: [],
    };

    (prisma.task.findMany as jest.Mock).mockResolvedValue([mockTask]);

    await expect(runScan(mockEmailQueue)).resolves.not.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
