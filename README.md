# Millennial PM System

**Role-Based Project & Task Management System**  
Practical assignment for the Senior Full Stack Developer role at Millennial Company.

> **Deadline note:** The PDF says "7th June 2025" but the email is dated 4 June 2026,
> so the effective deadline is treated as **7 June 2026, 8:00 PM IST**. This assumption
> is documented here and in the code comments.

---

## Feature Matrix

### Core (required)

| Feature | Status | Notes |
|---------|--------|-------|
| Auth — login / logout / refresh | ✅ Complete | JWT access (15 m) + refresh (7 d), bcrypt, refresh rotation |
| Auth — forgot / reset password | ✅ Complete | Token-based, 1 h expiry, HTML email |
| RBAC — Admin / PM / Employee | ✅ Complete | Enforced on every route; project-scoped for PM |
| Admin dashboard | ✅ Complete | Global totals, overdue count, recent projects |
| PM dashboard | ✅ Complete | Managed projects, active tasks, upcoming deadlines, overdue |
| Employee dashboard | ✅ Complete | Assigned tasks, due-soon, completed, hours logged, recent logs |
| Project CRUD | ✅ Complete | Admin creates/deletes; PM edits own; Employee read-only |
| Project progress tracking | ✅ Complete | Completion % computed from task statuses |
| Task CRUD | ✅ Complete | Priority, status, deadline, estimated hours, multi-assignee |
| Task assignment | ✅ Complete | Upsert-safe; socket event pushed to new assignees |
| Work log system | ✅ Complete | Hours + description + optional file attachment |
| Work log PM reply threads | ✅ Complete | Full threaded conversation stored in LogReply |
| Email notifications | ✅ Complete | 48h / 24h / 12h / 1h before deadline + overdue |
| Overdue alerts | ✅ Complete | Separate emails to employee AND PM |
| Activity audit log | ✅ Complete | Every mutating action logged with before/after JSON |
| Search & filters — projects | ✅ Complete | Status, manager, date range, search |
| Search & filters — tasks | ✅ Complete | Status, priority, employee, deadline range, overdue flag |
| Search & filters — logs | ✅ Complete | Employee (role-scoped), date range |
| Project report | ✅ Complete | Completion %, total/completed/pending per project |
| Employee report | ✅ Complete | Assigned, completed, avg days, total hours |
| Scheduler / queue worker | ✅ Complete | BullMQ repeatable job, idempotent, fires on startup |
| MySQL normalized schema | ✅ Complete | 9 tables, proper FK, composite unique on Notification |
| Pagination | ✅ Complete | All list endpoints, default 20 / max 100 |

### Bonus

| Feature | Status | Notes |
|---------|--------|-------|
| Real-time WebSockets | ✅ Complete | Socket.IO — notification bell, task moves, log replies |
| Kanban board (drag-drop) | ✅ Complete | HTML5 drag-drop, 5 columns, optimistic updates |
| File attachments | ✅ Complete | Multer, local storage, served as static files |
| Swagger / OpenAPI 3 | ✅ Complete | `/api/docs` with Bearer auth support |
| Dockerized deployment | ✅ Complete | `docker compose up --build` starts all 4 services |
| Unit + integration tests | ✅ Complete | 17 tests covering auth, RBAC, scheduler idempotency |
| Dark mode | ✅ Ready | Tailwind `darkMode: 'class'` — toggle not wired (CSS groundwork done) |
| CI/CD pipeline | ⬜ Skipped | GitHub Actions template trivial to add but outside assignment scope |
| Multi-tenant | ⬜ Skipped | Significant architectural change; not required by the brief |

---

## Architecture

```
apps/api  — Express + TypeScript + Prisma + BullMQ
apps/web  — React 18 + Vite + Tailwind + React Query + Socket.IO
MySQL 8   — normalized relational DB (9 tables)
Redis 7   — BullMQ queue storage
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for full system diagrams and
request flow sequences.

---

## Quick Start — Local (no Docker)

### Prerequisites

- Node.js 20+
- MySQL 8 running locally
- Redis 7 running locally

### Steps

```bash
# 1. Clone
git clone https://github.com/atinsharma24/millennial-pm-system
cd millennial-pm-system

# 2. API environment
cp .env.example apps/api/.env
# Edit DATABASE_URL, JWT secrets (or leave defaults for dev)

# 3. Install
cd apps/api && npm install
cd ../web  && npm install

# 4. Database
cd apps/api
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts

# 5. Start API (http://localhost:4000)
npm run dev

# 6. Start web (http://localhost:5173) — in a separate terminal
cd apps/web
npm run dev
```

Swagger UI: `http://localhost:4000/api/docs`

---

## Quick Start — Docker Compose

```bash
# Copy and (optionally) edit SMTP settings
cp .env.example apps/api/.env

# Build and start all services
docker compose up --build

# In a second terminal — seed the database
docker compose exec api npx ts-node prisma/seed.ts
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:4000 |
| Swagger | http://localhost:4000/api/docs |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |

---

## Seeded Test Users

| Role | Email | Password | What you can demo |
|------|-------|----------|--------------------|
| Admin | admin@millennial.com | Admin@123 | Full system; user CRUD; audit log; all reports |
| Project Manager | pm@millennial.com | PM@123456 | Manage projects; create tasks; reply to logs; PM reports |
| Project Manager | pm2@millennial.com | PM@123456 | Second PM account — test cross-PM isolation |
| Employee | emp1@millennial.com | Emp@123456 | View assigned tasks; submit logs; Kanban drag |
| Employee | emp2@millennial.com | Emp@123456 | Second employee — test multi-assignee |

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | mysql://root:password@localhost:3306/millennial_pm | ✅ | Prisma MySQL connection string |
| `JWT_ACCESS_SECRET` | — | ✅ | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | — | ✅ | Secret for signing refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | | Refresh token TTL |
| `REDIS_HOST` | `localhost` | | Redis hostname |
| `REDIS_PORT` | `6379` | | Redis port |
| `REDIS_PASSWORD` | — | | Redis password (optional) |
| `SMTP_HOST` | smtp.ethereal.email | | SMTP server |
| `SMTP_PORT` | `587` | | SMTP port |
| `SMTP_USER` | — | | Auto-provisions Ethereal account if empty |
| `SMTP_PASS` | — | | SMTP password |
| `EMAIL_FROM` | "Millennial PM \<noreply@…>" | | From address |
| `PORT` | `4000` | | API server port |
| `FRONTEND_URL` | http://localhost:5173 | | CORS allow-origin |
| `NODE_ENV` | `development` | | `development` \| `production` \| `test` |

Frontend (Vite):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | API base URL (injected at build time; dev proxy handles it automatically) |

---

## Sample API Calls

```bash
# ── Auth ──────────────────────────────────────────────────────────────────────

# Login
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@millennial.com","password":"Admin@123"}' | jq .

# (Copy accessToken from response)
TOKEN="eyJ..."

# Get profile
curl -s http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .

# ── Projects ──────────────────────────────────────────────────────────────────

# List projects
curl -s "http://localhost:4000/api/projects?status=ACTIVE" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create a project
curl -s -X POST http://localhost:4000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Website Redesign",
    "startDate": "2026-06-10",
    "endDate": "2026-09-30",
    "managerId": "<pm-user-id>"
  }' | jq .

# ── Tasks ─────────────────────────────────────────────────────────────────────

# Create a task
curl -s -X POST http://localhost:4000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Homepage hero section",
    "projectId": "<project-id>",
    "deadline": "2026-06-20T18:00:00Z",
    "priority": "HIGH",
    "assigneeIds": ["<emp-user-id>"]
  }' | jq .

# Filter overdue tasks
curl -s "http://localhost:4000/api/tasks?overdue=true" \
  -H "Authorization: Bearer $TOKEN" | jq .

# ── Work Logs ─────────────────────────────────────────────────────────────────

# Submit a work log (employee)
curl -s -X POST http://localhost:4000/api/worklogs \
  -H "Authorization: Bearer $EMP_TOKEN" \
  -F "taskId=<task-id>" \
  -F "description=Completed hero layout with responsive grid" \
  -F "hoursWorked=4"

# ── Reports ───────────────────────────────────────────────────────────────────

# Dashboard (role-aware)
curl -s http://localhost:4000/api/reports/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq .

# Project report
curl -s http://localhost:4000/api/reports/projects \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Running Tests

```bash
cd apps/api
npm test               # 17 tests, ~1 s
npm run test:coverage  # + lcov report in coverage/
```

See [`docs/TESTING.md`](docs/TESTING.md) for full coverage breakdown and
instructions on adding new tests.

---

## Documentation Index

| Document | What it covers |
|----------|---------------|
| [README.md](README.md) | Setup, feature matrix, env vars, test users, quickstart |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, request flows, RBAC model, queue design |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | ERD, per-table column reference, sample rows |
| [docs/API.md](docs/API.md) | Endpoint reference, request/response shapes, RBAC matrix |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Routing map, component tree, state management, role-gated UI |
| [docs/SCHEDULER.md](docs/SCHEDULER.md) | BullMQ wiring, reminder windows, idempotency, dev testing |
| [docs/TESTING.md](docs/TESTING.md) | Test suites, infrastructure, coverage gaps |
| [CHANGELOG.md](CHANGELOG.md) | Running log of what was built |

---

## Deployment Notes

### Production checklist

- [ ] Set strong random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Configure real SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`)
- [ ] Set `NODE_ENV=production`
- [ ] Change MySQL `root` password and create a dedicated DB user
- [ ] Set `REDIS_PASSWORD`
- [ ] Replace Multer disk storage with `multer-s3` for file attachments
- [ ] Run `npx prisma migrate deploy` (not `dev`) in the container
- [ ] Put the API behind a reverse proxy (nginx/Caddy) with TLS

### Horizontal scaling note

The scheduler fires on every API instance startup.  To avoid duplicate scans
when scaling to N replicas, promote the scheduler to a dedicated worker process
(or add a Redis-backed distributed lock with `ioredis-redlock`) so only one
instance runs the scan.

---

## Submission

- **GitHub:** https://github.com/atinsharma24/millennial-pm-system
- **Candidate:** Atin Sharma — atin.sde@gmail.com
- **Submit to:** yash@millennialcompany.in
