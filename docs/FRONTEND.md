# Frontend

## Tech Stack

| Concern       | Library / Tool                      |
|---------------|-------------------------------------|
| Framework     | React 18 + Vite 5                   |
| Language      | TypeScript 5                        |
| Routing       | React Router v6                     |
| Data fetching | TanStack React Query v5             |
| Auth state    | Zustand + localStorage persist      |
| HTTP client   | Axios (with refresh interceptor)    |
| Styling       | Tailwind CSS 3 + custom `brand` palette |
| Real-time     | Socket.IO client v4                 |
| Toasts        | Custom `ToastContext` (no deps)     |
| Icons         | Unicode symbols (no icon library)   |
| Date display  | date-fns                            |

---

## Routing Map

```
/                       → redirect to /dashboard or /login
/login                  → Login page (public)
/forgot-password        → ForgotPassword page (public)
/reset-password?token=  → ResetPassword page (public)
/dashboard              → Dashboard (all roles, different content)
/projects               → Project list (scoped by role)
/projects/:id           → Project detail + task table
/tasks                  → Task list with filters
/tasks/:id              → Task detail + work log thread
/kanban                 → Kanban board (drag-drop)
/worklogs               → Work log list with date filter
/users                  → User CRUD (Admin only)
/reports                → Project + Employee reports (Admin + PM)
/audit                  → Audit log viewer (Admin only)
```

Route guards (`ProtectedRoute`, `AdminRoute`, `PMOrAdminRoute`) are defined in
`src/App.tsx` and redirect to `/login` or `/dashboard` depending on auth state.

---

## Component Tree

```
App
├── Login (public)
├── ForgotPassword (public)
├── ResetPassword (public)
└── Layout (authenticated wrapper)
    ├── ToastProvider
    ├── SocketProvider
    ├── Sidebar (role-scoped nav links)
    ├── Header (notification bell + user name)
    └── <page> (varies by route)
        ├── Dashboard
        │   ├── StatCard ×n
        │   └── project/log tables (role-specific)
        ├── Projects
        │   ├── filter bar
        │   ├── ProjectCard ×n
        │   └── CreateProjectModal → Modal
        ├── ProjectDetail
        │   ├── StatCard ×4
        │   ├── progress bar
        │   └── task table
        ├── Tasks
        │   ├── filter bar
        │   ├── task table
        │   └── CreateTaskModal → Modal
        ├── TaskDetail
        │   ├── StatCard ×4
        │   ├── status update control
        │   └── WorkLog list
        │       ├── WorkLogForm (employee)
        │       └── WorkLogEntry ×n
        │           └── reply form
        ├── Kanban
        │   ├── project filter
        │   └── Column ×5 (TODO/IN_PROGRESS/IN_REVIEW/COMPLETED/BLOCKED)
        │       └── KanbanCard ×n (draggable)
        ├── WorkLogs
        │   └── LogEntry ×n
        ├── Users (Admin)
        │   ├── UserTable
        │   ├── CreateUserModal
        │   └── EditUserModal
        ├── Reports
        │   ├── ProjectReport table
        │   └── EmployeeReport table
        └── AuditLog
            └── AuditTable
```

---

## State Management

### Auth State — Zustand

```typescript
// src/context/AuthStore.ts
{
  user:          User | null,
  accessToken:   string | null,
  refreshToken:  string | null,
  setAuth(user, accessToken, refreshToken): void,
  clearAuth(): void,
}
```

Persisted to `localStorage` under the key `millennial-auth` via the Zustand
`persist` middleware.  Survives page refresh; cleared on logout.

### Server State — React Query

All API data is managed by React Query with 30-second `staleTime`.  After any
mutation (`useCreateTask`, `useUpdateTask`, etc.) the relevant query key is
invalidated so the UI refetches automatically.

Socket.IO events also trigger `qc.invalidateQueries()` for real-time freshness
without polling:
- `task:updated` → invalidate `['tasks']`, `['reports']`
- `task:assigned` → invalidate `['tasks']`
- `worklog:new` / `worklog:reply` → invalidate `['worklogs']`

### Toast State — Context

```typescript
// src/context/ToastContext.tsx
toast({ message: 'Task updated', type: 'success', duration: 4000 });
```

Toasts are stored in `useState` within `ToastProvider`.  They auto-dismiss and
render in a fixed bottom-right overlay.

---

## Role-Gated UI Rules

| Component / Page       | Admin | PM         | Employee     |
|------------------------|-------|------------|--------------|
| Sidebar: Users link    | ✅    | hidden     | hidden       |
| Sidebar: Reports link  | ✅    | ✅         | hidden       |
| Sidebar: Audit link    | ✅    | hidden     | hidden       |
| Projects — "New" btn   | ✅    | hidden     | hidden       |
| Tasks — "New" btn      | ✅    | ✅         | hidden       |
| Task detail — status   | all   | all        | status only  |
| Work log form          | ✅    | ✅         | assigned tasks |
| Reply to log           | ✅    | own project| own logs     |
| Kanban — project filter| ✅    | ✅         | hidden       |
| Dashboard stats        | global| scoped     | personal     |

---

## HTTP Client

`src/api/client.ts` wraps Axios with two interceptors:

1. **Request interceptor** — attaches `Authorization: Bearer <token>` from
   Zustand auth store.
2. **Response interceptor** — on 401, attempts a silent token refresh via
   `POST /auth/refresh`.  If the refresh succeeds the original request is
   retried.  If refresh fails the user is logged out and redirected to `/login`.

---

## Kanban Drag-Drop Implementation

The Kanban board (`src/pages/Kanban.tsx`) uses the **HTML5 Drag and Drop API**:

1. Each `KanbanCard` has `draggable={true}` and `onDragStart` / `onDragEnd`
   handlers that set `draggedId` state.
2. Each column div has `onDragOver` (calls `e.preventDefault()` to allow drop)
   and `onDrop` handlers.
3. On drop:
   - An **optimistic local override** (`setOptimisticStatus`) immediately re-
     renders the card in the target column.
   - `useUpdateTask(draggedId).mutateAsync({ status })` is called.
   - On success: toast "Moved to ___".
   - On failure: the optimistic override is reverted and an error toast appears.

No external library required.  The trade-off vs. `@dnd-kit/core` is no
accessibility keyboard navigation, but this is acceptable for a demo.

---

## Environment Variables

```env
VITE_API_URL=http://localhost:4000/api   # injected at build time
```

In `docker compose` the web image is built with `--build-arg VITE_API_URL=...`
so the production bundle points at the correct API host.  The Vite dev server
proxies `/api` to `localhost:4000` so the variable is only needed in the
Docker/production path.
