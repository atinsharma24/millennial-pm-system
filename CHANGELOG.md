# Changelog

All notable changes to the Millennial PM System are recorded here.

---

## [1.0.0] — 2026-06-05

### Commit 1 — Root scaffold
`chore: scaffold monorepo root`

- `.gitignore` — excludes node_modules, dist, .env, coverage
- `.env.example` — all variables with safe defaults documented
- `docker-compose.yml` — api + web + mysql + redis services
- `README.md` — initial placeholder

---

### Commit 2 — Prisma schema + migration + seed
`feat(api): Prisma schema, initial migration, and seed`

**Schema** (`apps/api/prisma/schema.prisma`):
- 9 models: User, Project, Task, TaskAssignment, WorkLog, LogReply, Notification, AuditLog
- Enums: Role (ADMIN/PM/EMPLOYEE), ProjectStatus, TaskStatus, TaskPriority, NotificationType
- Composite unique on `Notification(userId, taskId, type)` — idempotency key
- Indexes on every FK, deadline, status, and createdAt column
- Cascade deletes: Project→Task, Task→TaskAssignment/WorkLog/Notification, WorkLog→LogReply

**Migration** (`prisma/migrations/20260605000000_init/migration.sql`):
- Full hand-written SQL for MySQL 8 with all FKs and indexes

**Seed** (`prisma/seed.ts`):
- 5 users (1 admin, 2 PMs, 2 employees)
- 1 sample project with 2 tasks and 2 assignments

---

### Commit 3 — Full REST API
`feat(api): full REST API — auth, RBAC, projects, tasks, worklogs, reports, scheduler`

**Auth** (`src/routes/auth.ts`):
- POST /auth/login — bcrypt compare, access+refresh JWT, audit
- POST /auth/refresh — refresh rotation
- POST /auth/logout — clears stored refresh token
- GET  /auth/me
- POST /auth/forgot-password — random 32-byte token, 1 h expiry
- POST /auth/reset-password

**Middleware**:
- `authenticate.ts` — JWT Bearer verification
- `rbac.ts` — requireRole / requireAdmin / requireAdminOrPM guards
- `audit.ts` — `writeAudit()` utility for async fire-and-forget audit writes
- `validate.ts` — express-validator error collection

**Projects** (`src/routes/projects.ts`): full CRUD, role-scoped list, completionPct

**Tasks** (`src/routes/tasks.ts`): full CRUD, assign endpoint, employee status-only patch

**Work Logs** (`src/routes/worklogs.ts`): Multer file upload, PM reply endpoint

**Reports** (`src/routes/reports.ts`):
- GET /reports/dashboard (admin/PM)
- GET /reports/projects
- GET /reports/employees

**Notifications** (`src/routes/notifications.ts`): list, mark-read, mark-all-read

**Audit** (`src/routes/audit.ts`): admin-only paginated audit log viewer

**Scheduler** (`src/workers/scheduler.ts`):
- BullMQ `deadline-scan` repeatable job (every 30 min)
- BullMQ `email` queue with 3× exponential retry
- 4 reminder windows (48h/24h/12h/1h) + overdue alerts (employee + PM)
- Idempotency: checks Notification table before every enqueue
- Nodemailer (Ethereal auto-account in dev)

**Swagger**: full OpenAPI 3 spec at `/api/docs`

**Socket.IO**: Server created, clients join `user:<userId>` room on connect

---

### Commit 4 — Test fixes
`fix(api): resolve TS errors and get all 17 tests to green`

- JWT `expiresIn` typed as `never` to satisfy `StringValue` constraint
- BullMQ uses plain connection options (not IORedis instance) to avoid bundled-vs-peer version conflict
- `jest.config.js`: `isolatedModules: true`, `forceExit: true`, `tsconfig.test.json` reference
- `PORT=0` in `NODE_ENV=test` to prevent `EADDRINUSE` when multiple test suites start the server
- Scheduler test rewritten with extracted `runReminderScan()` helper

**Result**: 17/17 tests passing

---

### Commit 5 — React frontend
`feat(web): React frontend — login, role dashboards, projects, tasks, worklogs, reports`

**Pages**: Login, Dashboard (3 role variants), Projects, ProjectDetail, Tasks, TaskDetail, WorkLogs, Users, Reports, AuditLog

**Components**: Layout (sidebar + topbar), StatusBadge (task/priority/project), Modal, Spinner

**Infrastructure**:
- Zustand auth store with `persist` middleware
- Axios client with access-token interceptor + silent refresh
- React Query v5 with per-module hooks in `src/api/hooks.ts`
- Full type definitions in `src/types/index.ts`
- Tailwind CSS with `brand` color palette

**Docker**: `apps/web/Dockerfile` (nginx:alpine + SPA routing config)

---

### Commit 6 — Frontend TypeScript fixes
`fix(web): resolve TypeScript errors (Vite env types, Project/Task shape)`

- Add `vite/client` to tsconfig types for `import.meta.env`
- Extend `Project` type with optional `tasks[]`
- Extend `Task` type with optional `workLogs[]` and `project.managerId`
- Explicit `WorkLog` type annotation in TaskDetail map()

---

### Commit 7 — Backend Socket.IO + employee dashboard + JSDoc
`feat(api): Socket.IO real-time events, employee dashboard, JSDoc throughout`

- `utils/socket.ts`: `setIo()` / `emitToUser()` / `emitBroadcast()` singleton (no circular dep)
- `index.ts`: calls `setIo()` after creating Socket.IO server
- `tasks.ts`: `task:assigned` on create/assign, `task:updated` on every patch; full JSDoc
- `worklogs.ts`: `worklog:new` to PM, `worklog:reply` to log author; JSDoc
- `notifications.ts`: JSDoc
- `reports.ts`:
  - Employee dashboard: `assignedTasks`, `dueSoon`, `completedTasks`, `totalHoursLogged`, `recentLogs`
  - Admin dashboard: adds `recentProjects`
  - PM dashboard: adds `overdueTasks` count
- `scheduler.ts`: emits `notification:new` after each DB write; full JSDoc with architecture notes

---

### Commit 8 — Frontend Kanban, Socket context, toast, auth pages
`feat(web): Kanban drag-drop, real-time Socket.IO, toast system, auth pages`

- `context/ToastContext.tsx`: global toast overlay (4 types, auto-dismiss, slide-in animation)
- `context/SocketContext.tsx`: Socket.IO client; join room on login; handles 5 event types; invalidates React Query cache on each
- `pages/Kanban.tsx`: HTML5 drag-drop Kanban board — 5 columns, optimistic status updates, overdue card highlight, project filter (Admin/PM)
- `pages/ForgotPassword.tsx` + `ResetPassword.tsx`: complete password-reset UI flow
- `pages/Dashboard.tsx`: rewired to use real role-specific data from `/reports/dashboard`; Employee shows recent work log entries; Admin shows recent projects table; PM shows upcoming deadline list
- `components/Layout.tsx`: wired `ToastProvider` + `SocketProvider`; live unread notification badge (increments on `notification:new`); dropdown with per-notification timestamps; Kanban added to nav for all roles
- `App.tsx`: routes for `/kanban`, `/forgot-password`, `/reset-password`
- `tailwind.config.js`: `slide-in` keyframe animation for toast entries

---

## What's outstanding

- [ ] Frontend Vitest component tests
- [ ] E2E tests (Playwright)
- [ ] Dark mode toggle (CSS groundwork done with `darkMode: 'class'`)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Bull Board queue monitor UI
- [ ] S3 file attachment storage (currently local disk)
