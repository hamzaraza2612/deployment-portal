import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { usersRouter } from "./routes/users.routes";
import { serversRouter } from "./routes/servers.routes";
import { repositoriesRouter } from "./routes/repositories.routes";
import { deploymentsRouter } from "./routes/deployments.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { containersRouter } from "./routes/containers.routes";
import { linksRouter } from "./routes/links.routes";
import { promotionsRouter } from "./routes/promotions.routes";
import { configFilesRouter } from "./routes/configFiles.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { gitCredentialsRouter } from "./routes/gitCredentials.routes";
import { auditRouter } from "./routes/audit.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => callback(null, origin ?? true),
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/servers", serversRouter);
app.use("/api/servers", containersRouter);
app.use("/api/repositories", repositoriesRouter);
app.use("/api/deployments", deploymentsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/links", linksRouter);
app.use("/api/promotions", promotionsRouter);
app.use("/api/config-files", configFilesRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/git-credentials", gitCredentialsRouter);
app.use("/api/audit-logs", auditRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Deployment portal API listening on port ${env.port}`);
});
