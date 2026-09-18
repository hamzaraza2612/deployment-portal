import { Router } from "express";
import { prisma } from "../lib/prisma";
import { decrypt, encrypt } from "../lib/crypto";
import { recordAudit } from "../lib/audit";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { createRepositorySchema, updateRepositorySchema } from "../validators/schemas";

/** Extracts a usable hostname from a git remote URL, e.g. "gitlab.techbey.pk". */
function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new HttpError(400, "That doesn't look like a valid repository URL");
  }
}

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

    let username = body.username;
    let secretPlain = body.secret;
    if (!username || !secretPlain) {
      const host = hostFromUrl(body.url);
      const credential = await prisma.gitCredential.findUnique({ where: { host } });
      if (!credential) {
        throw new HttpError(
          400,
          `No saved git credential for ${host} — provide a username/token below, or add one under Git ` +
            `Credentials first so future repos on this host don't need it typed in again.`
        );
      }
      username = credential.username;
      secretPlain = decrypt(credential.secret);
    }

    const repository = await prisma.repository.create({
      data: {
        name: body.name,
        url: body.url,
        username,
        secret: encrypt(secretPlain),
      },
      select: LIST_SELECT,
    });
    recordAudit(req.user!, "repository.create", `Added repository ${repository.name} (${repository.url})`);
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
    recordAudit(req.user!, "repository.update", `Updated repository ${repository.name}`);
    res.json(repository);
  })
);

repositoriesRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const repository = await prisma.repository.delete({ where: { id: req.params.id } });
    recordAudit(req.user!, "repository.delete", `Deleted repository ${repository.name}`);
    res.status(204).end();
  })
);
