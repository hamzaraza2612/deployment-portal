import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '../lib/permissions';

const router = Router();

router.get(
  '/summary',
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (_req, res) => {
    const [users, servers, applications, environments, credentials] = await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.application.count(),
      prisma.environment.count(),
      prisma.credential.count(),
    ]);

    res.json({ users, servers, applications, environments, credentials });
  }),
);

export default router;
