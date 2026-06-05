# Millennial PM System

A **Role-Based Project & Task Management System** built as a practical assignment for Millennial Company's Senior Full Stack Developer position.

---

## Architecture

```mermaid
graph TD
    Browser["Browser (React + Vite)"] -->|REST / HTTP| API["Express API (Node.js + TypeScript)"]
    API -->|Prisma ORM| MySQL[(MySQL 8)]
    API -->|BullMQ jobs| Redis[(Redis 7)]
    Redis -->|Consumes jobs| Worker["BullMQ Workers (same process)"]
    Worker -->|SMTP| Email["Nodemailer → Ethereal (dev) / SMTP (prod)"]
    API -->|Socket.IO| Browser
```

**Monorepo layout:**
```
millennial-pm-system/
├── apps/
│   ├── api/          # Express + TypeScript + Prisma
│   └── web/          # React 18 + Vite + Tailwind + React Query
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Stack

| Layer       | Technology                                        |
|-------------|---------------------------------------------------|
| Backend     | Node.js 20 · Express · TypeScript                 |
| ORM         | Prisma 5 (MySQL provider)                         |
| Database    | MySQL 8                                           |
| Queue       | BullMQ 5 on Redis 7                               |
| Email       | Nodemailer (Ethereal auto-account in dev)         |
| Auth        | JWT (access 15 m + refresh 7 d)                   |
| Frontend    | React 18 · Vite · TypeScript · Tailwind CSS       |
| Data layer  | TanStack React Query v5                           |
| State       | Zustand (auth persistence via localStorage)       |
| Realtime    | Socket.IO (bonus – notification bell)             |
| API Docs    | Swagger / OpenAPI 3 at `/api/docs`               |
| Docker      | docker-compose (api · web · mysql · redis)        |
| Tests       | Jest + Supertest (API) · Vitest (web)             |

---

## Quick Start — Local (without Docker)

### Prerequisites
- Node.js 20+, MySQL 8, Redis 7

### 1. Clone & env
```bash
git clone <repo-url>
cd millennial-pm-system
cp .env.example apps/api/.env        # edit DATABASE_URL, Redis, JWT secrets
```

### 2. Install dependencies
```bash
cd apps/api && npm install
cd ../web  && npm install
```

### 3. Database setup
```bash
cd apps/api
npx prisma migrate dev --name init   # runs migration + generates client
npx ts-node prisma/seed.ts           # seed test users & sample data
```

### 4. Start API
```bash
cd apps/api
npm run dev
# → http://localhost:4000
# → Swagger: http://localhost:4000/api/docs
```

### 5. Start web
```bash
cd apps/web
npm run dev
# → http://localhost:5173
```

---

## Quick Start — Docker Compose

```bash
cp .env.example apps/api/.env   # optionally customise SMTP
docker compose up --build
```

| Service | URL                                |
|---------|------------------------------------|
| Web     | http://localhost:5173              |
| API     | http://localhost:4000              |
| Swagger | http://localhost:4000/api/docs     |
| MySQL   | localhost:3306                     |
| Redis   | localhost:6379                     |

After first start, seed the database:
```bash
docker compose exec api npx ts-node prisma/seed.ts
```

---

## Seeded Test Users

| Role            | Email                    | Password    |
|-----------------|--------------------------|-------------|
| Admin           | admin@millennial.com     | Admin@123   |
| Project Manager | pm@millennial.com        | PM@123456   |
| Project Manager | pm2@millennial.com       | PM@123456   |
| Employee        | emp1@millennial.com      | Emp@123456  |
| Employee        | emp2@millennial.com      | Emp@123456  |

---

## Environment Variables

| Variable                  | Default                        | Description                              |
|---------------------------|--------------------------------|------------------------------------------|
| `DATABASE_URL`            | mysql://root:password@...      | Prisma MySQL connection string           |
| `JWT_ACCESS_SECRET`       | —                              | **Required** — sign access tokens        |
| `JWT_REFRESH_SECRET`      | —                              | **Required** — sign refresh tokens       |
| `JWT_ACCESS_EXPIRES_IN`   | `15m`                          | Access token TTL                         |
| `JWT_REFRESH_EXPIRES_IN`  | `7d`                           | Refresh token TTL                        |
| `REDIS_HOST`              | `localhost`                    | Redis hostname                           |
| `REDIS_PORT`              | `6379`                         | Redis port                               |
| `REDIS_PASSWORD`          | —                              | Redis password (optional)                |
| `SMTP_HOST`               | smtp.ethereal.email            | SMTP server                              |
| `SMTP_PORT`               | `587`                          | SMTP port                                |
| `SMTP_USER`               | —                              | Auto-generated Ethereal account if empty |
| `SMTP_PASS`               | —                              | SMTP password                            |
| `EMAIL_FROM`              | "Millennial PM \<noreply@...>" | From address                             |
| `PORT`                    | `4000`                         | API server port                          |
| `FRONTEND_URL`            | http://localhost:5173           | CORS origin                              |
| `NODE_ENV`                | `development`                  | Environment                              |

---

## API — Sample Calls

```bash
# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@millennial.com","password":"Admin@123"}'

# List projects (pass token from login response)
curl http://localhost:4000/api/projects \
  -H "Authorization: Bearer <accessToken>"

# Create a project
curl -X POST http://localhost:4000/api/projects \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Project","startDate":"2026-06-01","endDate":"2026-12-31","managerId":"<pm-id>"}'

# Create a task
curl -X POST http://localhost:4000/api/tasks \
  -H "Authorization: Bearer <pm-or-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Build login page","projectId":"<id>","deadline":"2026-06-20T18:00:00Z","priority":"HIGH","assigneeIds":["<emp-id>"]}'

# Submit a work log (employee)
curl -X POST http://localhost:4000/api/worklogs \
  -H "Authorization: Bearer <employee-token>" \
  -F "taskId=<id>" -F "description=Completed login form" -F "hoursWorked=3"

# View reports
curl http://localhost:4000/api/reports/projects \
  -H "Authorization: Bearer <admin-or-pm-token>"
```

Full interactive docs: **`http://localhost:4000/api/docs`**

---

## Running Tests

```bash
cd apps/api
npm test                  # run all Jest tests
npm run test:coverage     # with coverage report
```

Tests cover:
- `auth.test.ts` — login happy path, wrong password, inactive user, validation
- `rbac.test.ts` — role guard on every protected route tier
- `scheduler.test.ts` — idempotency of reminder logic, email enqueue

---

## Features Implemented

### Must-have (complete)
- [x] JWT auth — login / logout / refresh / forgot-password / reset-password
- [x] RBAC — Admin · Project Manager · Employee with full guard enforcement
- [x] Role-based dashboards (stats scoped per role)
- [x] Project CRUD — create, edit, archive, progress tracking
- [x] Task CRUD — status, priority, deadline, estimated hours, assignees
- [x] Work log system — submit logs with file attachment, PM reply threads
- [x] Email notifications — 48h / 24h / 12h / 1h reminders + overdue alerts (employee + PM)
- [x] Activity audit log — every mutating action logged with user / before / after
- [x] Search & filters — projects (status, date), tasks (status, priority, deadline), logs (date range)
- [x] Reports — project completion %, employee hours + avg completion time
- [x] Scheduler / queue worker — BullMQ repeatable job, idempotent (skips already-sent)

### Bonus (complete)
- [x] Swagger / OpenAPI docs at `/api/docs`
- [x] Docker + docker-compose (4 services)
- [x] Unit + integration tests (Jest + Supertest)
- [x] Real-time notifications via Socket.IO (bell in navbar)
- [x] Dark mode ready (Tailwind `darkMode: 'class'`)
- [x] File attachments on work logs (multer → `/uploads`)

### Not implemented (time-constrained)
- [ ] Kanban board with drag & drop (tasks list view is table-based)
- [ ] CI/CD pipeline (GitHub Actions template would be trivial to add)
- [ ] Multi-tenant architecture

---

## Database Schema

```
Users        — id, name, email, password, role, isActive, refreshToken
Projects     — id, name, description, startDate, endDate, status, managerId
Tasks        — id, name, description, priority, status, deadline, estimatedHours, projectId, createdById
TaskAssignments — taskId + userId (composite unique)
WorkLogs     — id, taskId, userId, description, hoursWorked, attachmentUrl
LogReplies   — id, logId, userId, content
Notifications — id, userId, taskId, type, message, isRead  [UNIQUE(userId, taskId, type) → idempotent]
AuditLogs    — id, userId, userEmail, action, entity, entityId, previousValue, newValue, ipAddress
```

All tables use UUIDs as primary keys. Indexes on every FK, status enum, and deadline column.

---

## Architecture Decisions & Assumptions

1. **Deadline in PDF says "7th June 2025"** — the email is dated 4 June 2026, so the deadline is treated as **7 June 2026, 8:00 PM IST**.
2. **Monorepo** — two `apps/` rather than a standalone backend + separate frontend repo; easier to demo and share a single GitHub link.
3. **BullMQ** uses its own bundled ioredis to avoid version conflicts with a standalone `ioredis` peer — connection options are passed as plain objects.
4. **Ethereal email** is auto-provisioned if `SMTP_USER` is empty, so the app works out of the box without configuring any real SMTP. Preview URLs are logged to the console.
5. **Notifications unique constraint** `(userId, taskId, type)` is the idempotency key — the scheduler can re-run every 30 minutes without double-sending.
6. **JWT refresh** — refresh token is stored hashed in `User.refreshToken`; on every refresh a new pair is issued and the old refresh is invalidated.
7. **File uploads** — stored locally under `apps/api/uploads/` and served as static files. A production deployment would swap this for S3/GCS via a one-line Multer config change.

---

## Submission

- **GitHub:** `<paste-link-after-push>`
- **Submitted to:** yash@millennialcompany.in
- **Candidate:** Atin Sharma — atin.sde@gmail.com
