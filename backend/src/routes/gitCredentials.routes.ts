import { Router } from "express";
import { prisma } from "../lib/prisma";
import { encrypt } from "../lib/crypto";
import { recordAudit } from "../lib/audit";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { createGitCredentialSchema, updateGitCredentialSchema } from "../validators/schemas";

export const gitCredentialsRouter = Router();

gitCredentialsRouter.use(requireAuth, requireRole("ADMIN"));

const LIST_SELECT = {
  id: true,
  host: true,
  username: true,
  createdAt: true,
  updatedAt: true,
} as const;

gitCredentialsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const credentials = await prisma.gitCredential.findMany({
      select: LIST_SELECT,
      orderBy: { host: "asc" },
    });
    res.json(credentials);
  })
);

gitCredentialsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createGitCredentialSchema.parse(req.body);
    const credential = await prisma.gitCredential.create({
      data: { host: body.host, username: body.username, secret: encrypt(body.secret) },
      select: LIST_SELECT,
    });
    recordAudit(req.user!, "git-credential.create", `Added git credential for ${credential.host}`);
    res.status(201).json(credential);
  })
);

gitCredentialsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateGitCredentialSchema.parse(req.body);
    const data: Record<string, unknown> = { username: body.username };
    if (body.secret) data.secret = encrypt(body.secret);
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const credential = await prisma.gitCredential.update({
      where: { id: req.params.id },
      data,
      select: LIST_SELECT,
    });
    recordAudit(req.user!, "git-credential.update", `Updated git credential for ${credential.host}`);
    res.json(credential);
  })
);

gitCredentialsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const credential = await prisma.gitCredential.delete({ where: { id: req.params.id } });
    recordAudit(req.user!, "git-credential.delete", `Deleted git credential for ${credential.host}`);
    res.status(204).end();
  })
);
