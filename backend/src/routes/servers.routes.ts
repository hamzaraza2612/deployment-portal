import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '../lib/permissions';
import { createServerSchema } from '../validators/schemas';

const router = Router();

const serverSelect = {
  id: true,
  name: true,
  hostname: true,
  ipAddress: true,
  sshPort: true,
  sshUser: true,
  createdAt: true,
  credential: { select: { id: true, name: true, type: true } },
};

router.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.SERVER_VIEW),
  asyncHandler(async (_req, res) => {
    const servers = await prisma.server.findMany({ select: serverSelect, orderBy: { createdAt: 'asc' } });
    res.json({ servers });
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.SERVER_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createServerSchema.parse(req.body);
    const server = await prisma.server.create({ data, select: serverSelect });
    res.status(201).json({ server });
  }),
);

export default router;
