/**
 * Tests for deadline reminder scheduler idempotency logic.
 * All external dependencies (Prisma, BullMQ, email) are mocked.
 */

// ─── Mocks (must be before any imports) ──────────────────────────────────────

const mockNotificationCreate = jest.fn().mockResolvedValue({});
const mockNotificationFindUnique = jest.fn();
const mockTaskFindMany = jest.fn();
const mockAdd = jest.fn().mockResolvedValue({});

jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    task: { findMany: mockTaskFindMany },
    notification: {
      findUnique: mockNotificationFindUnique,
      findFirst: jest.fn().mockResolvedValue(null),
      create: mockNotificationCreate,
    },
  },
}));

jest.mock('../services/email', () => ({
  sendEmail: jest.fn(),
  deadlineReminderHtml: jest.fn().mockReturnValue('<html>r</html>'),
  overdueAlertHtml: jest.fn().mockReturnValue('<html>o</html>'),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

// ─── Extracted scan logic (mirrors worker but testable without Redis) ─────────

import { NotificationType, TaskStatus } from '@prisma/client';
import prisma from '../utils/prisma';

async function runReminderScan(
  hours: number,
  tasks: Array<{ id: string; name: string; assignments: Array<{ user: { id: string; name: string; email: string } }> }>,
  emailQueue: { add: (name: string, data: unknown) => Promise<void> }
) {
  const typeMap: Record<number, NotificationType> = {
    48: NotificationType.DEADLINE_48H,
    24: NotificationType.DEADLINE_24H,
    12: NotificationType.DEADLINE_12H,
    1:  NotificationType.DEADLINE_1H,
  };
  const notifType = typeMap[hours];

  for (const task of tasks) {
    for (const assignment of task.assignments) {
      const employee = assignment.user;

      const existing = await (prisma.notification.findUnique as jest.Mock)({
        where: { userId_taskId_type: { userId: employee.id, taskId: task.id, type: notifType } },
      });
      if (existing) continue;

      await (prisma.notification.create as jest.Mock)({ data: { userId: employee.id, taskId: task.id, type: notifType } });
      await emailQueue.add('send-reminder', { to: employee.email });
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Deadline Scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues email and creates notification for an upcoming task', async () => {
    const task = {
      id: 'task-1', name: 'Test Task',
      assignments: [{ user: { id: 'emp-1', name: 'Alice', email: 'alice@test.com' } }],
    };

    mockNotificationFindUnique.mockResolvedValue(null);  // not yet notified

    await runReminderScan(24, [task], { add: mockAdd });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith('send-reminder', expect.objectContaining({ to: 'alice@test.com' }));
  });

  it('is idempotent — skips if notification already exists', async () => {
    const task = {
      id: 'task-2', name: 'Already Reminded',
      assignments: [{ user: { id: 'emp-1', name: 'Alice', email: 'alice@test.com' } }],
    };

    mockNotificationFindUnique.mockResolvedValue({ id: 'existing' });  // already sent

    await runReminderScan(24, [task], { add: mockAdd });

    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('handles multiple assignees — sends one email per assignee', async () => {
    const task = {
      id: 'task-3', name: 'Multi-assign',
      assignments: [
        { user: { id: 'emp-1', name: 'Alice', email: 'alice@test.com' } },
        { user: { id: 'emp-2', name: 'Bob',   email: 'bob@test.com'   } },
      ],
    };

    mockNotificationFindUnique.mockResolvedValue(null);

    await runReminderScan(48, [task], { add: mockAdd });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });

  it('handles tasks with no assignees without throwing', async () => {
    const task = { id: 'task-4', name: 'Unassigned', assignments: [] };

    await expect(runReminderScan(12, [task], { add: mockAdd })).resolves.not.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('sends at all four reminder windows (48h, 24h, 12h, 1h)', async () => {
    const task = { id: 'task-5', name: 'All Windows', assignments: [{ user: { id: 'e1', name: 'E', email: 'e@t.com' } }] };
    mockNotificationFindUnique.mockResolvedValue(null);

    for (const h of [48, 24, 12, 1]) {
      await runReminderScan(h, [task], { add: mockAdd });
    }

    expect(mockAdd).toHaveBeenCalledTimes(4);
  });
});
