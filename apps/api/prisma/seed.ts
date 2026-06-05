import { PrismaClient, Role, ProjectStatus, TaskStatus, TaskPriority } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@millennial.com' },
    update: {},
    create: { name: 'Admin User', email: 'admin@millennial.com', password: hash('Admin@123'), role: Role.ADMIN },
  });

  const pm1 = await prisma.user.upsert({
    where: { email: 'pm@millennial.com' },
    update: {},
    create: { name: 'Sarah (PM)', email: 'pm@millennial.com', password: hash('PM@123456'), role: Role.PROJECT_MANAGER },
  });

  const pm2 = await prisma.user.upsert({
    where: { email: 'pm2@millennial.com' },
    update: {},
    create: { name: 'John (PM)', email: 'pm2@millennial.com', password: hash('PM@123456'), role: Role.PROJECT_MANAGER },
  });

  const emp1 = await prisma.user.upsert({
    where: { email: 'emp1@millennial.com' },
    update: {},
    create: { name: 'Alice (Dev)', email: 'emp1@millennial.com', password: hash('Emp@123456'), role: Role.EMPLOYEE },
  });

  const emp2 = await prisma.user.upsert({
    where: { email: 'emp2@millennial.com' },
    update: {},
    create: { name: 'Bob (Dev)', email: 'emp2@millennial.com', password: hash('Emp@123456'), role: Role.EMPLOYEE },
  });

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      name: 'E-Commerce Platform v2',
      description: 'Full redesign of the e-commerce platform with new checkout flow',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-08-31'),
      status: ProjectStatus.ACTIVE,
      managerId: pm1.id,
      createdById: admin.id,
    },
  });

  const task1 = await prisma.task.upsert({
    where: { id: 'seed-task-1' },
    update: {},
    create: {
      id: 'seed-task-1',
      name: 'Implement authentication module',
      description: 'JWT-based login, register, and password reset',
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      estimatedHours: 16,
      projectId: project.id,
      createdById: pm1.id,
    },
  });

  const task2 = await prisma.task.upsert({
    where: { id: 'seed-task-2' },
    update: {},
    create: {
      id: 'seed-task-2',
      name: 'Design product listing page',
      description: 'Responsive product grid with filters and sorting',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      estimatedHours: 8,
      projectId: project.id,
      createdById: pm1.id,
    },
  });

  await prisma.taskAssignment.upsert({
    where: { taskId_userId: { taskId: task1.id, userId: emp1.id } },
    update: {},
    create: { taskId: task1.id, userId: emp1.id },
  });

  await prisma.taskAssignment.upsert({
    where: { taskId_userId: { taskId: task2.id, userId: emp2.id } },
    update: {},
    create: { taskId: task2.id, userId: emp2.id },
  });

  console.log('Seed complete.');
  console.log('\nTest users:');
  console.log('  Admin:   admin@millennial.com   / Admin@123');
  console.log('  PM:      pm@millennial.com      / PM@123456');
  console.log('  PM 2:    pm2@millennial.com     / PM@123456');
  console.log('  Emp 1:   emp1@millennial.com    / Emp@123456');
  console.log('  Emp 2:   emp2@millennial.com    / Emp@123456');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
