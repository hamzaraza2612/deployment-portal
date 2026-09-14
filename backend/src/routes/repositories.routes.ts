import { Router } from "express";
import { prisma } from "../lib/prisma";
import { encrypt } from "../lib/crypto";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { createRepositorySchema, updateRepositorySchema } from "../validators/schemas";

export const repositoriesRouter = Router();

repositoriesRouter.use(requireAuth);

const LIST_SELECT = {
  id: true,
  name: true,
  url: true,
  username: true,
  createdAt: true,
  updatedAt: true,
} as const;

repositoriesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const repositories = await prisma.repository.findMany({
      select: LIST_SELECT,
      orderBy: { name: "asc" },
    });
    res.json(repositories);
  })
);

repositoriesRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createRepositorySchema.parse(req.body);
    const repository = await prisma.repository.create({
      data: {
        name: body.name,
        url: body.url,
        username: body.username,
        secret: encrypt(body.secret),
      },
      select: LIST_SELECT,
    });
    res.status(201).json(repository);
  })
);

repositoriesRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = updateRepositorySchema.parse(req.body);
    const data: Record<string, unknown> = {
      name: body.name,
      url: body.url,
      username: body.username,
    };
    if (body.secret) data.secret = encrypt(body.secret);
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const repository = await prisma.repository.update({
      where: { id: req.params.id },
      data,
      select: LIST_SELECT,
    });
    res.json(repository);
  })
);

repositoriesRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await prisma.repository.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
