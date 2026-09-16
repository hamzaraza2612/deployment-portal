import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getDownContainers } from "../services/alerts.service";

export const alertsRouter = Router();
alertsRouter.use(requireAuth);

alertsRouter.get(
  "/down-containers",
  asyncHandler(async (req, res) => {
    const summary = await getDownContainers(req.user!);
    res.json(summary);
  })
);
