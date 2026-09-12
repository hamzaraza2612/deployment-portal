import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '../lib/permissions';
import { createCredentialSchema } from '../validators/schemas';
import { encryptSecret } from '../lib/crypto';

const router = Router();

// Never select encryptedValue/iv/authTag here - credentials must not leave the server decrypted or at all.
const credentialSelect = {
  id: true,
  name: true,
  type: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
};

router.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
  asyncHandler(async (_req, res) => {
    const credentials = await prisma.credential.findMany({
      select: credentialSelect,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ credentials });
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createCredentialSchema.parse(req.body);
    const { encryptedValue, iv, authTag } = encryptSecret(data.value);
    const credential = await prisma.credential.create({
      data: {
        name: data.name,
        type: data.type,
        encryptedValue,
        iv,
        authTag,
        createdById: req.user!.sub,
      },
      select: credentialSelect,
    });
    res.status(201).json({ credential });
  }),
);

export default router;
