import { Router } from "express";
import { prisma } from "../lib/prisma";
import { encrypt } from "../lib/crypto";
import { testConnection } from "../lib/ssh";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { createServerSchema, updateServerSchema } from "../validators/schemas";
import type { ServerConnectionInfo } from "../lib/ssh";

export const serversRouter = Router();

serversRouter.use(requireAuth);

const LIST_SELECT = {
  id: true,
  name: true,
  environment: true,
  host: true,
  port: true,
  sshUser: true,
  authType: true,
  gitBaseDir: true,
  auditLogPath: true,
  basePaths: true,
  createdAt: true,
  updatedAt: true,
} as const;

function encodeSecret(auth: { authType: "PASSWORD" | "PRIVATE_KEY" } & Record<string, unknown>): string {
  if (auth.authType === "PASSWORD") {
    return encrypt(auth.password as string);
  }
  return encrypt(JSON.stringify({ privateKey: auth.privateKey, passphrase: auth.passphrase }));
}

serversRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const servers = await prisma.server.findMany({ select: LIST_SELECT, orderBy: { name: "asc" } });
    res.json(servers);
  })
);

serversRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: req.params.id },
      select: LIST_SELECT,
    });
    res.json(server);
  })
);

serversRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createServerSchema.parse(req.body);
    const server = await prisma.server.create({
      data: {
        name: body.name,
        environment: body.environment,
        host: body.host,
        port: body.port,
        sshUser: body.sshUser,
        gitBaseDir: body.gitBaseDir,
        auditLogPath: body.auditLogPath,
        basePaths: body.basePaths,
        authType: body.auth.authType,
        secret: encodeSecret(body.auth),
      },
      select: LIST_SELECT,
    });
    res.status(201).json(server);
  })
);

serversRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = updateServerSchema.parse(req.body);
    const data: Record<string, unknown> = {
      name: body.name,
      environment: body.environment,
      host: body.host,
      port: body.port,
      sshUser: body.sshUser,
      gitBaseDir: body.gitBaseDir,
      auditLogPath: body.auditLogPath,
      basePaths: body.basePaths,
    };
    if (body.auth) {
      data.authType = body.auth.authType;
      data.secret = encodeSecret(body.auth);
    }
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const server = await prisma.server.update({
      where: { id: req.params.id },
      data,
      select: LIST_SELECT,
    });
    res.json(server);
  })
);

serversRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await prisma.server.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

serversRouter.post(
  "/:id/test-connection",
  requireRole("ADMIN", "OPERATOR"),
  asyncHandler(async (req, res) => {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
    const info: ServerConnectionInfo = {
      host: server.host,
      port: server.port,
      sshUser: server.sshUser,
      authType: server.authType,
      secret: server.secret,
    };
    await testConnection(info);
    res.json({ ok: true });
  })
);
