# API Reference

> **Live interactive docs** are available at `http://localhost:4000/api/docs` (Swagger UI).  
> The raw OpenAPI 3 spec is at `http://localhost:4000/api/docs.json`.

## Base URL

```
http://localhost:4000/api
```

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Access tokens expire in **15 minutes**.  Use `POST /auth/refresh` with the
`refreshToken` (7-day TTL) to get a new pair without re-logging-in.

---

## RBAC Matrix

| Symbol | Meaning |
|--------|---------|
| ✅     | Full access |
| 🔒     | Scoped access (own resources only) |
| ❌     | Forbidden (403) |

| Endpoint                          | Admin | PM  | Employee |
|-----------------------------------|:-----:|:---:|:--------:|
| POST /auth/login                  | ✅    | ✅  | ✅       |
| GET  /auth/me                     | ✅    | ✅  | ✅       |
| POST /auth/refresh                | ✅    | ✅  | ✅       |
| POST /auth/logout                 | ✅    | ✅  | ✅       |
| POST /auth/forgot-password        | ✅    | ✅  | ✅       |
| POST /auth/reset-password         | ✅    | ✅  | ✅       |
| GET  /users                       | ✅    | ❌  | ❌       |
| POST /users                       | ✅    | ❌  | ❌       |
| PATCH /users/:id                  | ✅    | ❌  | ❌       |
| DELETE /users/:id                 | ✅    | ❌  | ❌       |
| GET  /projects                    | ✅    | 🔒  | 🔒       |
| POST /projects                    | ✅    | ❌  | ❌       |
| GET  /projects/:id                | ✅    | 🔒  | 🔒       |
| PATCH /projects/:id               | ✅    | 🔒  | ❌       |
| DELETE /projects/:id              | ✅    | ❌  | ❌       |
| GET  /tasks                       | ✅    | 🔒  | 🔒       |
| POST /tasks                       | ✅    | 🔒  | ❌       |
| GET  /tasks/:id                   | ✅    | 🔒  | 🔒       |
| PATCH /tasks/:id                  | ✅    | 🔒  | status↑  |
| POST /tasks/:id/assign            | ✅    | 🔒  | ❌       |
| DELETE /tasks/:id                 | ✅    | 🔒  | ❌       |
| GET  /worklogs                    | ✅    | 🔒  | 🔒       |
| POST /worklogs                    | ✅    | ✅  | 🔒       |
| POST /worklogs/:id/replies        | ✅    | 🔒  | own only |
| GET  /reports/dashboard           | ✅    | ✅  | ✅       |
| GET  /reports/projects            | ✅    | 🔒  | ❌       |
| GET  /reports/employees           | ✅    | 🔒  | ❌       |
| GET  /notifications               | ✅    | ✅  | ✅       |
| PATCH /notifications/:id/read     | ✅    | ✅  | ✅       |
| PATCH /notifications/read-all     | ✅    | ✅  | ✅       |
| GET  /audit                       | ✅    | ❌  | ❌       |

---

## Endpoints

### Auth

#### `POST /api/auth/login`

```json
// Request
{
  "email": "admin@millennial.com",
  "password": "Admin@123"
}

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": { "id": "...", "name": "Admin User", "email": "...", "role": "ADMIN" }
  }
}
```

#### `POST /api/auth/refresh`

```json
// Request
{ "refreshToken": "eyJhbGci..." }

// Response 200
{ "success": true, "data": { "accessToken": "...", "refreshToken": "..." } }
```

#### `GET /api/auth/me` *(auth required)*

```json
// Response 200
{
  "success": true,
  "data": { "id": "...", "name": "...", "email": "...", "role": "ADMIN", "createdAt": "..." }
}
```

#### `POST /api/auth/forgot-password`

```json
// Request
{ "email": "user@example.com" }
// Response 200 — always 200 to prevent user enumeration
{ "success": true, "message": "If the email exists, a reset link has been sent" }
```

#### `POST /api/auth/reset-password`

```json
// Request
{ "token": "<from-email>", "password": "NewPass@123" }
// Response 200
{ "success": true, "message": "Password reset successful" }
```

---

### Users *(Admin only)*

#### `GET /api/users`

Query params: `role`, `search`, `page`, `limit`

```json
// Response 200
{
  "success": true,
  "data": [
    { "id": "...", "name": "...", "email": "...", "role": "EMPLOYEE", "isActive": true }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

#### `POST /api/users`

```json
// Request
{ "name": "Alice", "email": "alice@co.com", "password": "Pass@123", "role": "EMPLOYEE" }
// Response 201
{ "success": true, "data": { "id": "...", ... } }
```

---

### Projects

#### `GET /api/projects`

Query params: `status`, `managerId` *(admin)*, `from`, `to` (start date range), `search`, `page`, `limit`

```json
// Response 200
{
  "success": true,
  "data": [{
    "id": "...", "name": "E-Commerce v2", "status": "ACTIVE",
    "manager": { "id": "...", "name": "Sarah" },
    "_count": { "tasks": 12 }
  }],
  "pagination": { ... }
}
```

#### `GET /api/projects/:id`

Returns project with all tasks (including assignments) and `completionPct`.

```json
{
  "success": true,
  "data": {
    "id": "...", "name": "...", "completionPct": 42,
    "tasks": [ { "id": "...", "status": "IN_PROGRESS", "assignments": [...] } ]
  }
}
```

#### `POST /api/projects` *(Admin)*

```json
{
  "name": "New Site",
  "description": "Company website redesign",
  "startDate": "2026-06-01",
  "endDate": "2026-12-31",
  "managerId": "<pm-user-id>",
  "status": "PLANNING"
}
```

---

### Tasks

#### `GET /api/tasks`

Query params: `status`, `priority`, `projectId`, `employeeId`, `search`,
`deadlineBefore`, `deadlineAfter`, `overdue=true`, `page`, `limit`

#### `POST /api/tasks`

```json
{
  "name": "Build auth module",
  "description": "JWT login, refresh, reset",
  "projectId": "<project-id>",
  "priority": "HIGH",
  "status": "TODO",
  "deadline": "2026-06-20T18:00:00Z",
  "estimatedHours": 16,
  "assigneeIds": ["<user-id-1>", "<user-id-2>"]
}
```

#### `PATCH /api/tasks/:id`

- **Employee**: only `status` field is accepted.
- **PM / Admin**: any field.

```json
{ "status": "IN_PROGRESS" }
```

#### `POST /api/tasks/:id/assign`

```json
{ "userIds": ["<user-id>"] }
```

---

### Work Logs

#### `POST /api/worklogs` — multipart/form-data

```
taskId:      <uuid>
description: Completed login form UI
hoursWorked: 3.5
attachment:  <file>       ← optional
```

#### `POST /api/worklogs/:id/replies`

```json
{ "content": "Looks good, please add unit tests." }
```

---

### Reports

#### `GET /api/reports/dashboard`

Returns role-specific stats object.  See `docs/ARCHITECTURE.md` for per-role shape.

#### `GET /api/reports/projects`

```json
[{
  "id": "...", "name": "...", "status": "ACTIVE", "manager": "Sarah",
  "totalTasks": 10, "completedTasks": 4, "pendingTasks": 6, "completionPct": 40
}]
```

#### `GET /api/reports/employees`

```json
[{
  "id": "...", "name": "Alice", "email": "...",
  "assignedTasks": 5, "completedTasks": 3,
  "totalHoursLogged": 24.5, "avgCompletionDays": 4
}]
```

---

### Notifications

#### `GET /api/notifications`

Query params: `unread=true`, `page`, `limit`

#### `PATCH /api/notifications/:id/read`

Marks one notification read.

#### `PATCH /api/notifications/read-all`

Marks all of the current user's unread notifications read.

---

### Audit Log *(Admin only)*

#### `GET /api/audit`

Query params: `userId`, `entity`, `action`, `from`, `to`, `page`, `limit`

```json
{
  "data": [{
    "id": "...", "action": "CREATE_TASK", "entity": "Task", "entityId": "...",
    "userEmail": "pm@millennial.com",
    "newValue": { "name": "Build login", "projectId": "...", "priority": "HIGH" },
    "createdAt": "2026-06-05T10:00:00Z"
  }]
}
```

---

## Pagination

All list endpoints return:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

Default: `page=1`, `limit=20`.  Max limit: `100`.

---

## Error Responses

```json
// 400 Bad Request
{ "success": false, "message": "Validation error", "errors": [{ "field": "email", "msg": "Invalid" }] }

// 401 Unauthorized
{ "success": false, "message": "Invalid or expired token" }

// 403 Forbidden
{ "success": false, "message": "Forbidden" }

// 404 Not Found
{ "success": false, "message": "Not found" }

// 500 Internal Server Error
{ "success": false, "message": "Internal server error" }
```

---

## Socket.IO Events

Connect to `ws://localhost:4000` (path `/socket.io`).

After connecting, emit:
```js
socket.emit('join', userId);  // join private room
```

Listen for:
| Event               | Payload                                      | Recipients  |
|---------------------|----------------------------------------------|-------------|
| `notification:new`  | `{ id, type, message, taskId, sentAt }`      | Employee/PM |
| `task:updated`      | `{ taskId, status, updatedBy }`              | Assignees   |
| `task:assigned`     | `{ taskId, taskName, projectName, deadline }`| New assignee|
| `worklog:new`       | `{ logId, taskName, projectName, submittedBy, hoursWorked }` | PM |
| `worklog:reply`     | `{ replyId, logId, taskName, repliedBy, preview }` | Log author |
