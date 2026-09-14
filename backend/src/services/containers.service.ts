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
 * setup) started — we read the compose project/service back off the container's
 * own labels and re-run `docker compose up -d --force-recreate` for just that
 * service, the same way the original deploy script restarts a container.
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
  const service = labels["com.docker.compose.service"];
  if (!workingDir || !service) {
    throw new HttpError(
      400,
      "This container wasn't started with docker compose, so it can't be recreated — use restart instead."
    );
  }

  const script = `
set -e
cd ${shQuote(workingDir)}
docker compose up -d --force-recreate --no-deps ${shQuote(service)}
`.trim();

  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Recreate failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
