import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock('../workers/scheduler', () => ({ startScheduler: jest.fn() }));

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

import { app } from '../index';
import prisma from '../utils/prisma';

function makeToken(role: string, userId = 'user-1') {
  return jwt.sign({ userId, email: `${role.toLowerCase()}@test.com`, role }, 'test-access-secret', { expiresIn: '1h' });
}

describe('RBAC enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows ADMIN to access /api/users', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${makeToken('ADMIN')}`);

    expect(res.status).toBe(200);
  });

  it('blocks PROJECT_MANAGER from /api/users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${makeToken('PROJECT_MANAGER')}`);

    expect(res.status).toBe(403);
  });

  it('blocks EMPLOYEE from /api/users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${makeToken('EMPLOYEE')}`);

    expect(res.status).toBe(403);
  });

  it('rejects requests without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('rejects expired/invalid tokens', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('blocks EMPLOYEE from creating projects', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${makeToken('EMPLOYEE')}`)
      .send({ name: 'Test', startDate: '2026-01-01', endDate: '2026-12-31', managerId: 'pm-1' });
    expect(res.status).toBe(403);
  });

  it('blocks PROJECT_MANAGER from creating projects', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${makeToken('PROJECT_MANAGER')}`)
      .send({ name: 'Test', startDate: '2026-01-01', endDate: '2026-12-31', managerId: 'pm-1' });
    expect(res.status).toBe(403);
  });
});
