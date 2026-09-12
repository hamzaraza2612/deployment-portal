import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '../lib/permissions';
import { createApplicationSchema } from '../validators/schemas';

const router = Router();

router.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.APPLICATION_VIEW),
  asyncHandler(async (_req, res) => {
    const applications = await prisma.application.findMany({
      include: { environments: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ applications });
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.APPLICATION_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createApplicationSchema.parse(req.body);
    const application = await prisma.application.create({ data });
    res.status(201).json({ application });
  }),
);

export default router;
