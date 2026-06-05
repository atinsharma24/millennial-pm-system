# Scheduler

## Overview

The deadline-reminder scheduler is implemented with **BullMQ** on top of
**Redis 7**.  It lives entirely in `apps/api/src/workers/scheduler.ts` and is
started once from `src/index.ts` at server boot (skipped in `NODE_ENV=test`).

---

## Job Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Redis                                                      │
│                                                             │
│  deadline-scan queue                                        │
│  └── repeatable job  "*/30 * * * *"                         │
│       jobId: "deadline-scan-repeatable"                     │
│                                                             │
│  email queue                                                │
│  └── per-message jobs (reminder-48h-…, overdue-emp-…, …)   │
└─────────────────────────────────────────────────────────────┘
           │                              │
   scan Worker                    email Worker
   (processes deadline-scan)      (processes email)
```

### `deadline-scan` queue

| Property | Value |
|----------|-------|
| Schedule | `*/30 * * * *` — every 30 minutes |
| Job ID   | `deadline-scan-repeatable` (deduplicates on restart) |
| Concurrency | 1 (only one scan runs at a time) |
| Retry | None (scan is cheap and idempotent) |

### `email` queue

| Property | Value |
|----------|-------|
| Attempts | 3 |
| Back-off | Exponential, starting at 5 000 ms |
| Concurrency | Default BullMQ (processes jobs in parallel) |

---

## Reminder Windows

On each scan the worker queries the database for tasks whose `deadline` falls
within a 2-hour window centred on each trigger point:

| Window | Database range           | NotificationType |
|--------|--------------------------|------------------|
| 48 h   | `now+47h … now+49h`      | `DEADLINE_48H`   |
| 24 h   | `now+23h … now+25h`      | `DEADLINE_24H`   |
| 12 h   | `now+11h … now+13h`      | `DEADLINE_12H`   |
|  1 h   | `now+0h  … now+2h`       | `DEADLINE_1H`    |
| Overdue| `deadline < now`         | `OVERDUE`        |

---

## Idempotency

Before creating a `Notification` row or enqueuing an email the scheduler checks:

```sql
SELECT id FROM Notification
WHERE userId = ? AND taskId = ? AND type = ?
LIMIT 1
```

If a row is found the entire block is skipped.  This unique index:

```sql
UNIQUE KEY Notification_userId_taskId_type_key (userId, taskId, type)
```

acts as a database-level fence.  Even if:
- The scan runs twice within the same window
- Redis crashes and the scan re-runs on restart
- The email worker fails and the job is retried

…no duplicate emails are sent.

---

## Email Templates

Two HTML template functions live in `src/services/email.ts`:

### `deadlineReminderHtml(params)`

```typescript
{
  employeeName: string;
  taskName:     string;
  projectName:  string;
  deadline:     Date;
  hoursLeft:    number;
}
```

### `overdueAlertHtml(params)`

```typescript
{
  recipientName: string;
  taskName:      string;
  projectName:   string;
  deadline:      Date;
  role:          'employee' | 'manager';
}
```

---

## Dev Setup — Testing Emails Locally

### Option A — Ethereal (default, zero config)

If `SMTP_USER` is not set the service auto-creates an Ethereal test account.
Look at the API server console for lines like:

```
info: Ethereal email account: alice.xxx@ethereal.email
info: Email preview: https://ethereal.email/message/ABC...
```

Open the preview URL to see exactly what was sent.

### Option B — Set a specific SMTP server

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
```

### Triggering a reminder immediately (dev shortcut)

The scheduler fires on startup, so you can:

1. Create a task with a deadline 30–50 minutes from now.
2. Restart the API server.
3. The scan runs immediately and should enqueue a 1 h reminder.

Or manually run the exported function:

```typescript
// in a ts-node REPL or test:
import { scanAndEnqueueReminders } from './src/workers/scheduler';
await scanAndEnqueueReminders();
```

---

## BullMQ / IORedis version note

BullMQ 5 bundles its own version of `ioredis`.  To avoid the
`Property 'connecting' is protected` type conflict we pass plain connection
option objects (not an IORedis instance) to `new Queue()` and `new Worker()`:

```typescript
function redisOpts() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
  };
}
```

This is the recommended pattern in BullMQ's own documentation when you want to
control the connection options without managing the connection lifecycle.

---

## Monitoring

BullMQ exposes queue metrics via `bull-board` (not wired in this project, but
easy to add):

```bash
npm i @bull-board/api @bull-board/express
```

Then mount the board at `/api/queues` for a visual job dashboard.
