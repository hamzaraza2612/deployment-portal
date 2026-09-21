import { Router } from "express";
import { prisma } from "../lib/prisma";
import { encrypt } from "../lib/crypto";
import { recordAudit } from "../lib/audit";
import { fieldChangeDetails } from "../lib/diff";
import { normalizeHost } from "../lib/gitHost";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
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

async function assertHostAvailable(host: string, excludeId?: string): Promise<void> {
  const existing = await prisma.gitCredential.findUnique({ where: { host } });
  if (existing && existing.id !== excludeId) {
    throw new HttpError(409, `A credential for ${host} already exists — edit that one instead.`);
  }
}

gitCredentialsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createGitCredentialSchema.parse(req.body);
    // Normalized so a host pasted as a full URL ("https://gitlab.example.com/") still
    // matches a repository's own hostFromUrl() lookup later (see lib/gitHost.ts).
    const host = normalizeHost(body.host);
    await assertHostAvailable(host);
    const credential = await prisma.gitCredential.create({
      data: { host, username: body.username, secret: encrypt(body.secret) },
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
    const existing = await prisma.gitCredential.findUniqueOrThrow({
      where: { id: req.params.id },
      select: LIST_SELECT,
    });
    const data: Record<string, unknown> = { username: body.username };
    if (body.host) {
      const host = normalizeHost(body.host);
      await assertHostAvailable(host, existing.id);
      data.host = host;
    }
    if (body.secret) data.secret = encrypt(body.secret);
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const credential = await prisma.gitCredential.update({
      where: { id: req.params.id },
      data,
      select: LIST_SELECT,
    });
    const changes = fieldChangeDetails(existing, data, ["host", "username"]);
    const details = body.secret
      ? { kind: "fields", changes: { ...(changes?.changes as object), secret: { from: "(hidden)", to: "updated" } } }
      : changes;
    recordAudit(req.user!, "git-credential.update", `Updated git credential for ${credential.host}`, details);
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
