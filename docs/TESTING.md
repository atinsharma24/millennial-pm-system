# Testing

## Running Tests

```bash
# From apps/api/
npm test              # run all Jest suites
npm run test:coverage # generate lcov / text coverage report
```

---

## Test Suites

### `src/__tests__/auth.test.ts` — 5 tests

Covers `POST /api/auth/login` via Supertest against the real Express app
(Prisma is mocked).

| Test | Description |
|------|-------------|
| returns tokens on valid credentials | Happy path — valid email + password → 200 with `accessToken` and `refreshToken` |
| rejects wrong password | bcrypt mismatch → 401 |
| rejects unknown email  | Prisma returns `null` → 401 |
| rejects inactive user  | `isActive: false` → 401 |
| validates email format | Missing/invalid `email` field → 400 with validation errors |

### `src/__tests__/rbac.test.ts` — 7 tests

Covers role-guard enforcement across different roles and routes.  A helper
`makeToken(role)` signs a JWT with the test secret so we don't need real users.

| Test | Description |
|------|-------------|
| allows ADMIN to access /api/users     | 200 |
| blocks PROJECT_MANAGER from /api/users | 403 |
| blocks EMPLOYEE from /api/users        | 403 |
| rejects requests without token         | 401 |
| rejects expired/invalid tokens         | 401 |
| blocks EMPLOYEE from creating projects | 403 |
| blocks PROJECT_MANAGER from creating projects | 403 |

### `src/__tests__/scheduler.test.ts` — 5 tests

Covers the extracted `runReminderScan()` helper.  BullMQ, Prisma, and
Nodemailer are all mocked — no Redis or DB required.

| Test | Description |
|------|-------------|
| enqueues email and creates notification for an upcoming task | happy path |
| is idempotent — skips if notification already exists        | repeated scan = no duplicate |
| handles multiple assignees — sends one email per assignee   | two assignees → two emails |
| handles tasks with no assignees without throwing            | edge case |
| sends at all four reminder windows (48h, 24h, 12h, 1h)     | all windows fire |

---

## Test Infrastructure

| Tool | Version | Use |
|------|---------|-----|
| Jest | 29      | Test runner |
| ts-jest | 29  | TypeScript compilation in Jest |
| Supertest | 7 | HTTP assertions against Express app |
| `isolatedModules: true` | — | Speeds up compilation; skips full type-check in tests |
| `forceExit: true` | — | Prevents Jest hanging on open handles (Socket.IO) |
| `PORT=0` in test | — | OS assigns random port; prevents EADDRINUSE when multiple suites start the server |

---

## What's Not Covered (and Why)

| Gap | Reason | Priority to add |
|-----|--------|----------------|
| Integration tests against a real MySQL DB | Requires Docker in CI; adds complexity | Medium |
| E2E tests (Playwright/Cypress) | Out of scope for time-boxed assignment | Low |
| Frontend component tests (Vitest + RTL) | Skeleton `vitest` dep added; tests not written | Medium |
| Refresh-token rotation test | Covered by the auth test but refresh endpoint itself not tested | Low |
| File upload test | Needs temp directory setup | Low |
| Socket.IO emission tests | Hard to assert without a running Redis | Low |

---

## Coverage Report

Run `npm run test:coverage` to generate an lcov report in `coverage/`.

Last known baseline (all mocked, no DB):

```
File                          | Stmts | Branch | Funcs | Lines
------------------------------|-------|--------|-------|------
src/middleware/auth.ts        |   100 |    100 |   100 |   100
src/middleware/rbac.ts        |   100 |    100 |   100 |   100
src/routes/auth.ts            |    72 |     60 |    80 |    72
src/workers/scheduler.ts      |    58 |     45 |    66 |    58
```

Routes not exercised in unit tests (require DB) have lower coverage.
Integration tests against a real database would push overall coverage above 80 %.

---

## Adding New Tests

1. Create `src/__tests__/<module>.test.ts`.
2. Mock Prisma at the top:

```typescript
jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn() }, ... },
}));
```

3. Mock the scheduler to avoid Redis:

```typescript
jest.mock('../workers/scheduler', () => ({ startScheduler: jest.fn() }));
```

4. Import `app` from `../index` and use Supertest:

```typescript
import request from 'supertest';
import { app } from '../index';

it('returns 200', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
});
```
