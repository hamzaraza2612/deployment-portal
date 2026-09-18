import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { createUserSchema, updateUserSchema } from "../validators/schemas";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("ADMIN"));

const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  allowedEnvironments: true,
  createdAt: true,
} as const;

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: SAFE_SELECT,
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  })
);

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new HttpError(409, "A user with this email already exists");
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        allowedEnvironments: body.allowedEnvironments,
        passwordHash,
      },
      select: SAFE_SELECT,
    });
    recordAudit(req.user!, "user.create", `Added user ${user.name} (${user.email}, ${user.role})`);
    res.status(201).json(user);
  })
);

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.role) data.role = body.role;
    if (body.allowedEnvironments) data.allowedEnvironments = body.allowedEnvironments;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: SAFE_SELECT,
    });
    recordAudit(req.user!, "user.update", `Updated user ${user.name} (${user.email})`);
    res.json(user);
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user?.userId) {
      throw new HttpError(400, "You cannot delete your own account");
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    const [deploymentCount, promotionCount] = await Promise.all([
      prisma.deployment.count({ where: { triggeredById: user.id } }),
      prisma.promotionRequest.count({ where: { requestedById: user.id } }),
    ]);
    if (deploymentCount > 0 || promotionCount > 0) {
      throw new HttpError(
        400,
        `Cannot delete ${user.name} — they triggered ${deploymentCount} deployment(s) and ` +
          `${promotionCount} promotion(s), kept for audit purposes. Change their role instead if they should ` +
          `no longer have access.`
      );
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    recordAudit(req.user!, "user.delete", `Deleted user ${user.name} (${user.email})`);
    res.status(204).end();
  })
);
