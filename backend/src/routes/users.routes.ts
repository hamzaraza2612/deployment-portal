import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { PERMISSIONS } from '../lib/permissions';
import { createUserSchema, updateUserSchema } from '../validators/schemas';

const router = Router();

const userSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
};

router.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.USER_VIEW),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } });
    res.json({ users });
  }),
);

router.get(
  '/roles',
  requireAuth,
  requirePermission(PERMISSIONS.USER_VIEW),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ select: { id: true, name: true } });
    res.json({ roles });
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new HttpError(409, 'A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        roleId: data.roleId,
        passwordHash,
      },
      select: userSelect,
    });
    res.status(201).json({ user });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const data = updateUserSchema.parse(req.body);
    const updateData: Record<string, unknown> = {
      name: data.name,
      roleId: data.roleId,
      isActive: data.isActive,
    };
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: userSelect,
    });
    res.json({ user });
  }),
);

export default router;
