import type { Server } from "@prisma/client";
import { shQuote, execScript } from "../lib/ssh";
import { HttpError } from "../middleware/errorHandler";
import { execCommandOnServer, toConnectionInfo } from "./deploy.service";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  composeProject?: string;
  composeService?: string;
}

interface DockerPsLine {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  Ports: string;
  Labels: string;
}

function parseLabels(raw: string): Record<string, string> {
  const labels: Record<string, string> = {};
  raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx > 0) labels[pair.slice(0, idx)] = pair.slice(idx + 1);
    });
  return labels;
}

export async function listContainers(server: Server): Promise<ContainerInfo[]> {
  const info = toConnectionInfo(server);
  const result = await execCommandOnServer(info, `docker ps -a --format '{{json .}}'`);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to list containers: ${result.stderr || result.stdout}`);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const raw = JSON.parse(line) as DockerPsLine;
      const labels = parseLabels(raw.Labels ?? "");
      return {
        id: raw.ID,
        name: raw.Names,
        image: raw.Image,
        status: raw.Status,
        state: raw.State,
        ports: raw.Ports,
        composeProject: labels["com.docker.compose.project"],
        composeService: labels["com.docker.compose.service"],
      };
    });
}

export interface ContainerStats {
  id: string;
  cpuPercent: string;
  memUsage: string;
  memPercent: string;
  netIO: string;
  blockIO: string;
}

interface DockerStatsLine {
  ID: string;
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
  NetIO: string;
  BlockIO: string;
}

/** One live snapshot per running container (docker stats only reports running ones), like `docker stats --no-stream`. */
export async function getContainerStats(server: Server): Promise<ContainerStats[]> {
  const info = toConnectionInfo(server);
  const result = await execCommandOnServer(info, `docker stats --no-stream --format '{{json .}}'`);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to read container stats: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const raw = JSON.parse(line) as DockerStatsLine;
      return {
        id: raw.ID,
        cpuPercent: raw.CPUPerc,
        memUsage: raw.MemUsage,
        memPercent: raw.MemPerc,
        netIO: raw.NetIO,
        blockIO: raw.BlockIO,
      };
    });
}

export async function getContainerLogs(
  server: Server,
  containerId: string,
  tailLines: number
): Promise<string> {
  if (!containerId.trim()) {
    throw new HttpError(400, "containerId is required");
  }
  const clamped = Math.min(Math.max(Math.trunc(tailLines) || 200, 20), 2000);
  const info = toConnectionInfo(server);
  // Merge stderr into stdout in the remote command itself so log lines come back in the
  // container's own chronological order rather than split across two separate buffers.
  const result = await execCommandOnServer(
    info,
    `docker logs --tail ${clamped} --timestamps ${shQuote(containerId)} 2>&1`
  );
  if (result.code !== 0 && !result.stdout.trim()) {
    throw new HttpError(502, `Failed to read logs: ${result.stdout || "unknown error"}`);
  }
  return result.stdout;
}

type SimpleAction = "start" | "stop" | "restart";

export async function runContainerAction(
  server: Server,
  containerId: string,
  action: SimpleAction
): Promise<string> {
  if (!containerId.trim()) {
    throw new HttpError(400, "containerId is required");
  }
  const info = toConnectionInfo(server);
  const result = await execCommandOnServer(info, `docker ${action} ${shQuote(containerId)}`);
  if (result.code !== 0) {
    throw new HttpError(502, `docker ${action} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

/**
 * "Recreate" only makes sense for containers this portal (or any docker compose
 * setup) started — we read the compose project directory back off the
 * container's own labels and run `docker compose down -v && docker compose up
 * -d` there. This tears down and deletes volumes for every service in that
 * compose project, not just the clicked container — the caller is expected to
 * have confirmed that explicitly (the frontend's confirm dialog spells this
 * out) since it's destructive to any persistent data those services hold.
 */
export async function recreateContainer(server: Server, containerId: string): Promise<string> {
  if (!containerId.trim()) {
    throw new HttpError(400, "containerId is required");
  }
  const info = toConnectionInfo(server);

  const inspect = await execCommandOnServer(
    info,
    `docker inspect --format '{{json .Config.Labels}}' ${shQuote(containerId)}`
  );
  if (inspect.code !== 0) {
    throw new HttpError(502, `Failed to inspect container: ${inspect.stderr || inspect.stdout}`);
  }

  let labels: Record<string, string | undefined> = {};
  try {
    labels = JSON.parse(inspect.stdout.trim()) ?? {};
  } catch {
    labels = {};
  }

  const workingDir = labels["com.docker.compose.project.working_dir"];
  if (!workingDir) {
    throw new HttpError(
      400,
      "This container wasn't started with docker compose, so it can't be recreated — use restart instead."
    );
  }

  const script = `
set -e
cd ${shQuote(workingDir)}
docker compose down -v
docker compose up -d
`.trim();

  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Recreate failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
