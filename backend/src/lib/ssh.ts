import { Client, type ConnectConfig } from "ssh2";
import { decrypt } from "./crypto";
import { HttpError } from "../middleware/errorHandler";

export interface ServerConnectionInfo {
  host: string;
  port: number;
  sshUser: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  secret: string; // encrypted at rest, decrypted by caller before use
  /** Friendly name shown in connection-failure messages instead of raw host/IP. */
  label?: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type OnData = (chunk: string, stream: "stdout" | "stderr") => void;

function buildConnectConfig(info: ServerConnectionInfo): ConnectConfig {
  const decrypted = decrypt(info.secret);
  const base: ConnectConfig = {
    host: info.host,
    port: info.port,
    username: info.sshUser,
    readyTimeout: 15000,
  };

  if (info.authType === "PASSWORD") {
    return { ...base, password: decrypted };
  }

  // PRIVATE_KEY: secret payload is JSON { privateKey, passphrase? }
  const parsed = JSON.parse(decrypted) as { privateKey: string; passphrase?: string };
  return { ...base, privateKey: parsed.privateKey, passphrase: parsed.passphrase || undefined };
}

export async function withSSHConnection<T>(
  info: ServerConnectionInfo,
  fn: (conn: Client) => Promise<T>
): Promise<T> {
  const conn = new Client();
  try {
    try {
      await new Promise<void>((resolve, reject) => {
        conn
          .on("ready", () => resolve())
          .on("error", (err) => reject(err))
          .connect(buildConnectConfig(info));
      });
    } catch (err) {
      // Swap ssh2's raw error ("All configured authentication methods failed", DNS
      // failures, timeouts, ...) for a message an end user can actually act on —
      // the real reason still goes to the server logs for whoever manages the app.
      console.error(`SSH connection to ${info.label ?? info.host} failed:`, err);
      throw new HttpError(502, `Unable to connect to ${info.label ?? info.host} server`);
    }
    return await fn(conn);
  } finally {
    conn.end();
  }
}

export function execCommand(conn: Client, command: string, onData?: OnData): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream
        .on("close", (code: number | null) => {
          resolve({ code: code ?? 0, stdout, stderr });
        })
        .on("data", (data: Buffer) => {
          const text = data.toString("utf8");
          stdout += text;
          onData?.(text, "stdout");
        })
        .stderr.on("data", (data: Buffer) => {
          const text = data.toString("utf8");
          stderr += text;
          onData?.(text, "stderr");
        });
    });
  });
}

/** Runs a multi-line bash script remotely via stdin, so we avoid quoting hell for complex commands. */
export async function execScript(
  info: ServerConnectionInfo,
  script: string,
  onData?: OnData
): Promise<ExecResult> {
  return withSSHConnection(info, (conn) =>
    new Promise<ExecResult>((resolve, reject) => {
      conn.exec("bash -s", (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        stream
          .on("close", (code: number | null) => {
            resolve({ code: code ?? 0, stdout, stderr });
          })
          .on("data", (data: Buffer) => {
            const text = data.toString("utf8");
            stdout += text;
            onData?.(text, "stdout");
          })
          .stderr.on("data", (data: Buffer) => {
            const text = data.toString("utf8");
            stderr += text;
            onData?.(text, "stderr");
          });
        stream.end(script);
      });
    })
  );
}

/** Safely single-quotes a value for interpolation into a remote bash script. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function testConnection(info: ServerConnectionInfo): Promise<void> {
  await withSSHConnection(info, async (conn) => {
    const result = await execCommand(conn, "echo ok");
    if (result.code !== 0) {
      throw new Error(`SSH command failed with exit code ${result.code}: ${result.stderr}`);
    }
  });
}
