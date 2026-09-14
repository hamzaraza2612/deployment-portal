import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { listContainers, recreateContainer, runContainerAction } from "../services/containers.service";

export const containersRouter = Router();

containersRouter.use(requireAuth);

containersRouter.get(
  "/:serverId/containers",
  asyncHandler(async (req, res) => {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.serverId } });
    const containers = await listContainers(server);
    res.json(containers);
  })
);

containersRouter.post(
  "/:serverId/containers/:containerId/action",
  requireRole("ADMIN", "OPERATOR"),
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action ?? "");
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.serverId } });
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
