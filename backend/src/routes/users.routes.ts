import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { createUserSchema, updateUserSchema } from "../validators/schemas";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("ADMIN"));

const SAFE_SELECT = { id: true, email: true, name: true, role: true, createdAt: true } as const;

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
      data: { email: body.email, name: body.name, role: body.role, passwordHash },
      select: SAFE_SELECT,
    });
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
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: SAFE_SELECT,
    });
    res.json(user);
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user?.userId) {
      throw new HttpError(400, "You cannot delete your own account");
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
