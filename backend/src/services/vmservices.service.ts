import type { Server } from "@prisma/client";
import { execScript } from "../lib/ssh";
import { HttpError } from "../middleware/errorHandler";
import { toConnectionInfo } from "./deploy.service";

export interface VmServiceStatus {
  name: string;
  running: boolean;
  method: "systemd" | "port" | "process" | "none";
  cpuPercent: number | null;
  memKb: number | null;
}

// Known services we check for automatically — no per-server configuration needed.
// Each is detected in order: a likely systemd unit name, then a well-known port,
// then a process name pattern (covers distros that name the unit differently,
// e.g. Debian's versioned "postgresql@14-main").
const SCRIPT = `
check_service() {
  local name="$1"; local units="$2"; local port="$3"; local patterns="$4"
  local state="stopped"; local method="none"; local pid=""

  for unit in $units; do
    if systemctl is-active --quiet "$unit" 2>/dev/null; then
      state="running"; method="systemd"
      pid=$(systemctl show "$unit" --property=MainPID --value 2>/dev/null)
      break
    fi
  done

  if [ "$state" = "stopped" ] && [ -n "$port" ]; then
    if ss -tln 2>/dev/null | grep -q ":$port "; then
      state="running"; method="port"
    fi
  fi

  if [ "$state" = "stopped" ] && [ -n "$patterns" ]; then
    for pat in $patterns; do
      found_pid=$(pgrep -f "$pat" 2>/dev/null | head -1)
      if [ -n "$found_pid" ]; then
        state="running"; method="process"; pid="$found_pid"
        break
      fi
    done
  fi

  local cpu=""; local mem_kb=""
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    read cpu mem_kb < <(ps -o %cpu=,rss= -p "$pid" 2>/dev/null | tr -s ' ')
  fi

  echo "SERVICE:$name"
  echo "STATE:$state"
  echo "METHOD:$method"
  echo "CPU:$cpu"
  echo "MEM_KB:$mem_kb"
  echo "---"
}

check_service "Redis" "redis redis-server" "6379" "redis-server"
check_service "PostgreSQL" "postgresql" "5432" "postgres postmaster"
check_service "MSSQL" "mssql-server" "1433" "sqlservr"
check_service "MongoDB" "mongod" "27017" "mongod"
check_service "Docker" "docker" "" "dockerd"
`.trim();

export async function getVmServiceStatus(server: Server): Promise<VmServiceStatus[]> {
  const info = toConnectionInfo(server);
  const result = await execScript(info, SCRIPT);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to check services: ${result.stderr || result.stdout}`);
  }

  const services: VmServiceStatus[] = [];
  let current: Record<string, string> = {};

  for (const line of result.stdout.split("\n")) {
    if (line.trim() === "---") {
      if (current.SERVICE) {
        const cpu = Number(current.CPU);
        const mem = Number(current.MEM_KB);
        services.push({
          name: current.SERVICE,
          running: current.STATE === "running",
          method: (current.METHOD as VmServiceStatus["method"]) ?? "none",
          cpuPercent: current.CPU && !Number.isNaN(cpu) ? cpu : null,
          memKb: current.MEM_KB && !Number.isNaN(mem) ? mem : null,
        });
      }
      current = {};
      continue;
    }
    const [key, ...rest] = line.split(":");
    if (key) current[key.trim()] = rest.join(":").trim();
  }

  return services;
}
