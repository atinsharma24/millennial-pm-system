# Architecture

## System Overview

Millennial PM is a monorepo containing two applications that communicate via a REST API and a WebSocket layer:

```
millennial-pm-system/
├── apps/
│   ├── api/   — Node.js / Express / TypeScript backend
│   └── web/   — React 18 / Vite / TypeScript frontend
└── docs/      — this documentation
```

---

## Component Diagram

```mermaid
graph TB
    subgraph Browser
        UI["React SPA (Vite)"]
        ZU["Zustand (auth state)"]
        RQ["React Query (data cache)"]
        SC["Socket.IO Client"]
        UI --- ZU
        UI --- RQ
        UI --- SC
    end

    subgraph API ["Express API (port 4000)"]
        MW["Middleware Stack\n(helmet, cors, morgan, rate-limit)"]
        AUTH["Auth Routes\n/api/auth/*"]
        ROUTES["Business Routes\n(projects, tasks, worklogs…)"]
        RBAC["RBAC Middleware\nrequireAdmin / requireAdminOrPM"]
        AUDIT["Audit Middleware\nwriteAudit()"]
        SW["Swagger UI\n/api/docs"]
        SIO["Socket.IO Server"]
        SOCKET_UTIL["socket.ts\nsetIo / emitToUser"]
    end

    subgraph Workers
        SCAN["deadline-scan Worker\n(every 30 min)"]
        EMAIL_W["email Worker\n(3 retries, exponential backoff)"]
    end

    subgraph Storage
        MYSQL[("MySQL 8\nmillennial_pm DB")]
        REDIS[("Redis 7\nBullMQ queues")]
        UPLOADS["Local /uploads/\n(file attachments)"]
    end

    subgraph External
        SMTP["SMTP Server\n(Ethereal in dev)"]
    end

    UI -->|"REST (axios)"| MW
    SC -->|"WebSocket"| SIO
    MW --> AUTH & ROUTES
    ROUTES --> RBAC --> AUDIT
    ROUTES -->|"Prisma"| MYSQL
    ROUTES --> SOCKET_UTIL --> SIO --> SC
    SIO -->|"join room"| SC

    SCAN -->|"Prisma"| MYSQL
    SCAN --> EMAIL_W
    EMAIL_W -->|"Nodemailer"| SMTP
    SCAN --> SOCKET_UTIL

    EMAIL_W --- REDIS
    SCAN --- REDIS
    ROUTES --- UPLOADS
```

---

## Request Flow Diagrams

### Auth — Login

```mermaid
sequenceDiagram
    actor C as Client
    participant E as Express
    participant V as express-validator
    participant P as Prisma/MySQL
    participant J as jsonwebtoken

    C->>E: POST /api/auth/login {email, password}
    E->>V: validate body
    V-->>E: ok
    E->>P: user.findUnique({email})
    P-->>E: User row (with hashed password)
    E->>E: bcrypt.compare(password, hash)
    E->>J: sign access token (15m)
    E->>J: sign refresh token (7d)
    E->>P: user.update({refreshToken})
    E->>P: auditLog.create(LOGIN)
    E-->>C: 200 {accessToken, refreshToken, user}
```

### Task Creation

```mermaid
sequenceDiagram
    actor PM as PM / Admin
    participant E as Express
    participant RBAC as RBAC guard
    participant P as Prisma
    participant SIO as Socket.IO

    PM->>E: POST /api/tasks {name, projectId, deadline, assigneeIds}
    E->>RBAC: requireAdminOrPM
    RBAC-->>E: ok
    E->>P: project.findUnique (verify PM owns project)
    E->>P: task.create (with TaskAssignment rows)
    E->>P: auditLog.create
    loop each assignee
        E->>SIO: emitToUser(assigneeId, 'task:assigned', payload)
    end
    E-->>PM: 201 Task object
    SIO-->>Browser: task:assigned event (toast)
```

### Deadline Reminder Firing

```mermaid
sequenceDiagram
    participant CRON as BullMQ Repeatable Job (30 min)
    participant SCAN as deadline-scan Worker
    participant P as Prisma/MySQL
    participant Q as email Queue
    participant SIO as Socket.IO
    participant MAIL as Nodemailer/SMTP

    CRON->>SCAN: trigger scan job
    loop For each window [48h, 24h, 12h, 1h]
        SCAN->>P: task.findMany (deadline in window, not COMPLETED)
        loop Each task × Each assignee
            SCAN->>P: notification.findUnique (idempotency check)
            alt Not yet notified
                SCAN->>P: notification.create
                SCAN->>SIO: emitToUser(userId, 'notification:new')
                SCAN->>Q: emailQueue.add(reminder job)
            end
        end
    end
    Q->>MAIL: sendEmail (HTML template)
    MAIL-->>Employee: Reminder email
```

### Audit Logging

```mermaid
sequenceDiagram
    actor U as User
    participant R as Route Handler
    participant A as writeAudit()
    participant P as Prisma

    U->>R: PATCH /api/tasks/:id
    R->>R: fetch previous state
    R->>P: task.update(new data)
    R->>A: writeAudit({userId, action, entity, previousValue, newValue})
    A->>P: auditLog.create (async, non-blocking)
    R-->>U: 200 updated task
```

---

## RBAC Model

Three roles are stored as an enum in the `User.role` column.

| Action                        | ADMIN | PROJECT_MANAGER | EMPLOYEE |
|-------------------------------|:-----:|:---------------:|:--------:|
| Create / delete users         | ✅    | ❌              | ❌       |
| Create / delete projects      | ✅    | ❌              | ❌       |
| Update any project            | ✅    | own only        | ❌       |
| Create / update any task      | ✅    | own project     | status only |
| Assign employees to tasks     | ✅    | own project     | ❌       |
| Submit work logs              | ✅    | ✅              | own tasks |
| Reply to work logs            | ✅    | own project     | own logs |
| View all audit logs           | ✅    | ❌              | ❌       |
| View all reports              | ✅    | own projects    | ❌       |
| Receive email reminders       | ✅    | ✅              | ✅       |

### Implementation

```
authenticate()       — verifies JWT, attaches req.user
requireRole(...roles) — checks req.user.role against the whitelist
requireAdmin         — alias for requireRole(ADMIN)
requireAdminOrPM     — alias for requireRole(ADMIN, PROJECT_MANAGER)
```

Project-level scoping (PM can only touch their own projects) is enforced inside
each route handler via the `canManageTask()` / `canAccessProject()` helpers that
look up the project's `managerId` against `req.user.userId`.

---

## Queue / Scheduler Design

```
scanQueue ("deadline-scan")
  └── repeatable job — pattern: "*/30 * * * *"
        ↓ scanAndEnqueueReminders()
              ↓ for each [48h, 24h, 12h, 1h] window
                    ↓ Notification.findUnique (idempotency)
                    ↓ Notification.create
                    ↓ Socket.IO emit
                    ↓ emailQueue.add(job)

emailQueue ("email")
  └── per-message job
        ↓ Nodemailer.sendMail()
        retry: 3 × exponential back-off starting at 5 s
```

**Idempotency strategy** — The `Notification` table has a unique composite
index `(userId, taskId, type)`.  Before enqueuing an email the scanner performs
a `findUnique` on that compound key.  If the row already exists the entire
reminder block is skipped.  This means:

1. The scheduler can run more frequently without double-sending.
2. A Redis outage followed by a re-run will not re-send already-delivered mail.
3. The unique constraint acts as a natural deduplication fence even if the
   worker crashes mid-scan and restarts.

---

## Data Flow for File Attachments

```
POST /api/worklogs (multipart/form-data)
  ↓ multer middleware (apps/api/uploads/)
  ↓ filename stored in WorkLog.attachmentUrl ("/uploads/<timestamp>-<name>")
  ↓ served as static file at /uploads/<filename>
```

In production, replace the `multer.diskStorage` engine with `multer-s3` and
point `attachmentUrl` at the CDN URL.  No route changes needed.

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ORM | Prisma | Type-safe queries, migration tooling, schema-as-source-of-truth |
| Queue | BullMQ | Redis-backed, repeatable jobs, per-job retry, battle-tested |
| Auth | JWT (access + refresh) | Stateless; refresh rotation invalidates stolen tokens |
| Email (dev) | Ethereal auto-account | Zero config; preview URLs logged to console |
| Frontend state | Zustand | Lightweight; `persist` middleware for auth across tabs |
| Data fetching | React Query v5 | Automatic cache invalidation, stale-while-revalidate |
| Drag-drop | Native HTML5 | Zero runtime dependency; sufficient for a Kanban demo |
| Socket server | Socket.IO | Room-based private delivery; fallback to polling |
