import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '../lib/permissions';
import { createEnvironmentSchema } from '../validators/schemas';

const router = Router();

const environmentInclude = {
  application: { select: { id: true, name: true } },
  server: { select: { id: true, name: true, hostname: true } },
};

router.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.ENVIRONMENT_VIEW),
  asyncHandler(async (_req, res) => {
    const environments = await prisma.environment.findMany({
      include: environmentInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ environments });
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.ENVIRONMENT_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createEnvironmentSchema.parse(req.body);
    const environment = await prisma.environment.create({ data, include: environmentInclude });
    res.status(201).json({ environment });
  }),
);

export default router;
