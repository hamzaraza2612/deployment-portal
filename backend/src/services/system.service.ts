import type { Server } from "@prisma/client";
import { execScript } from "../lib/ssh";
import { HttpError } from "../middleware/errorHandler";
import { toConnectionInfo } from "./deploy.service";

export interface SystemStats {
  cpuPercent: number | null;
  memTotalMb: number | null;
  memUsedMb: number | null;
  memAvailableMb: number | null;
  diskTotalKb: number | null;
  diskUsedKb: number | null;
  diskAvailKb: number | null;
}

// vmstat's 1-second sample gives a reliable, dependency-free CPU% across virtually
// any Debian/Ubuntu-family host; free/df cover memory and root disk usage.
const SCRIPT = `
CPU_IDLE=$(vmstat 1 2 2>/dev/null | tail -1 | awk '{print $15}')
if [ -n "$CPU_IDLE" ]; then echo "CPU_PERCENT:$((100 - CPU_IDLE))"; fi
free -m 2>/dev/null | awk '/^Mem:/ {print "MEM_TOTAL_MB:"$2; print "MEM_USED_MB:"$3; print "MEM_AVAILABLE_MB:"$7}'
df -Pk / 2>/dev/null | awk 'NR==2 {print "DISK_TOTAL_KB:"$2; print "DISK_USED_KB:"$3; print "DISK_AVAIL_KB:"$4}'
`.trim();

export async function getSystemStats(server: Server): Promise<SystemStats> {
  const info = toConnectionInfo(server);
  const result = await execScript(info, SCRIPT);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to read system stats: ${result.stderr || result.stdout}`);
  }

  const values: Record<string, number> = {};
  for (const line of result.stdout.split("\n")) {
    const [key, value] = line.split(":");
    if (key && value !== undefined && !Number.isNaN(Number(value))) {
      values[key.trim()] = Number(value);
    }
  }

  return {
    cpuPercent: values.CPU_PERCENT ?? null,
    memTotalMb: values.MEM_TOTAL_MB ?? null,
    memUsedMb: values.MEM_USED_MB ?? null,
    memAvailableMb: values.MEM_AVAILABLE_MB ?? null,
    diskTotalKb: values.DISK_TOTAL_KB ?? null,
    diskUsedKb: values.DISK_USED_KB ?? null,
    diskAvailKb: values.DISK_AVAIL_KB ?? null,
  };
}
