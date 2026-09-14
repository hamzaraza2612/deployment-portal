import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import type { AuthTokenPayload } from "../middleware/auth";
import { canAccessEnvironment } from "../lib/access";
import {
  getContainerLogs,
  getContainerStats,
  listContainers,
  recreateContainer,
  runContainerAction,
} from "../services/containers.service";

export const containersRouter = Router();

containersRouter.use(requireAuth);

async function loadAccessibleServer(user: AuthTokenPayload, serverId: string) {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  if (!canAccessEnvironment(user, server.environment)) {
    throw new HttpError(404, "Server not found");
  }
  return server;
}

containersRouter.get(
  "/:serverId/containers",
  asyncHandler(async (req, res) => {
    const server = await loadAccessibleServer(req.user!, req.params.serverId);
    const containers = await listContainers(server);
    res.json(containers);
  })
);

containersRouter.get(
  "/:serverId/containers/stats",
  asyncHandler(async (req, res) => {
    const server = await loadAccessibleServer(req.user!, req.params.serverId);
    const stats = await getContainerStats(server);
    res.json(stats);
  })
);

containersRouter.get(
  "/:serverId/containers/:containerId/logs",
  asyncHandler(async (req, res) => {
    const server = await loadAccessibleServer(req.user!, req.params.serverId);
    const tail = Number(req.query.tail ?? 200);
    const log = await getContainerLogs(server, req.params.containerId, tail);
    res.json({ log });
  })
);

containersRouter.post(
  "/:serverId/containers/:containerId/action",
  requireRole("ADMIN", "OPERATOR"),
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action ?? "");
    const server = await loadAccessibleServer(req.user!, req.params.serverId);
    const containerId = req.params.containerId;

    if (action === "recreate") {
      const output = await recreateContainer(server, containerId);
      res.json({ ok: true, output });
      return;
    }
    if (action === "start" || action === "stop" || action === "restart") {
      const output = await runContainerAction(server, containerId, action);
      res.json({ ok: true, output });
      return;
    }
    throw new HttpError(400, "Unknown action — expected start, stop, restart, or recreate");
  })
);
