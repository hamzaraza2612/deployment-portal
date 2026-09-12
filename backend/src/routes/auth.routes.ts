import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { loginSchema } from '../validators/schemas';
import { clearAuthCookie, requireAuth, setAuthCookie, signAuthToken } from '../middleware/auth';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
    });
    setAuthCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
      },
    });
  }),
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).send();
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) {
      throw new HttpError(401, 'Not authenticated');
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        permissions: user.role.permissions.map((p) => p.permission.key),
      },
    });
  }),
);

export default router;
