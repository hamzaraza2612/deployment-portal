import { prisma } from "../lib/prisma";
import type { AuthTokenPayload } from "../middleware/auth";
import { accessibleEnvironments } from "../lib/access";
import { listContainers } from "./containers.service";

export interface DownContainerServer {
  serverId: string;
  serverName: string;
  environment: string;
  containers: { name: string; state: string; status: string }[];
}

/**
 * Every accessible server's non-running containers, environment-scoped the same way as
 * everything else. A server that can't be reached over SSH right now is skipped rather than
 * failing the whole summary — this is a best-effort status check, not a deploy-critical path.
 */
export async function getDownContainers(user: AuthTokenPayload): Promise<DownContainerServer[]> {
  const envs = accessibleEnvironments(user);
  const servers = await prisma.server.findMany({
    where: envs === "all" ? {} : { environment: { in: envs } },
  });

  const results = await Promise.all(
    servers.map(async (server): Promise<DownContainerServer | null> => {
      try {
        const containers = await listContainers(server);
        const down = containers.filter((c) => c.state !== "running");
        if (down.length === 0) return null;
        return {
          serverId: server.id,
          serverName: server.name,
          environment: server.environment,
          containers: down.map((c) => ({ name: c.name, state: c.state, status: c.status })),
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is DownContainerServer => r !== null);
}
