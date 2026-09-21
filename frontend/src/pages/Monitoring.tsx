import { useState } from "react";
import { DockerStats } from "./DockerStats";
import { ServerMonitoring } from "./ServerMonitoring";

type Tab = "docker" | "hosts";

export function Monitoring() {
  const [tab, setTab] = useState<Tab>("docker");

  return (
    <div>
      <div className="wizard-steps" style={{ marginBottom: 16 }}>
        <span
          className={"wizard-step" + (tab === "docker" ? " current" : "")}
          style={{ cursor: "pointer" }}
          onClick={() => setTab("docker")}
        >
          Docker Stats
        </span>
        <span
          className={"wizard-step" + (tab === "hosts" ? " current" : "")}
          style={{ cursor: "pointer" }}
          onClick={() => setTab("hosts")}
        >
          Server Monitoring
        </span>
      </div>
      {tab === "docker" ? <DockerStats /> : <ServerMonitoring />}
    </div>
  );
}
