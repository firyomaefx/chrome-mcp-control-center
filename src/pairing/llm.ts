import fs from "node:fs";
import path from "node:path";
import type { AppConfig, LlmConnection } from "../config.js";
import { createConnection, saveConfig } from "../config.js";

export interface PairingBundle {
  connection: LlmConnection;
  token: string;
  configs: Record<string, string>;
  files: string[];
}

function serveCommand(projectRoot: string): { command: string; args: string[] } {
  const cli = path.join(projectRoot, "dist", "cli.js");
  return { command: "node", args: [cli.replace(/\\/g, "/"), "serve"] };
}

export function generatePairingConfigs(
  projectRoot: string,
  dataDir: string,
  token: string,
  name: string,
): Record<string, string> {
  const { command, args } = serveCommand(projectRoot);
  const env = {
    CHROME_MCP_TOKEN: token,
    CHROME_MCP_DATA_DIR: dataDir,
  };

  const mcpServerBlock = {
    mcpServers: {
      [name]: {
        command,
        args,
        env,
      },
    },
  };

  const grok = JSON.stringify(mcpServerBlock, null, 2);
  const claude = JSON.stringify(mcpServerBlock, null, 2);
  const codex = JSON.stringify(
    {
      mcp: {
        servers: {
          [name]: {
            command,
            args,
            env,
          },
        },
      },
    },
    null,
    2,
  );
  const generic = `# Generic MCP stdio
command: ${command}
args: ${args.join(" ")}
env:
  CHROME_MCP_TOKEN=${token}
  CHROME_MCP_DATA_DIR=${dataDir}
`;

  return { grok, claude, codex, generic };
}

export function pairLlm(
  cfg: AppConfig,
  dataDir: string,
  projectRoot: string,
  name: string,
  provider: LlmConnection["provider"],
): { config: AppConfig; bundle: PairingBundle } {
  const { config, token, connection } = createConnection(cfg, name, provider);
  saveConfig(dataDir, config);
  const configs = generatePairingConfigs(projectRoot, dataDir, token, name);
  const outDir = path.join(dataDir, "pairings", connection.id);
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const [k, v] of Object.entries(configs)) {
    const f = path.join(outDir, `${k}.txt`);
    fs.writeFileSync(f, v, "utf8");
    files.push(f);
  }
  fs.writeFileSync(path.join(outDir, "TOKEN.txt"), token, "utf8");
  return {
    config,
    bundle: { connection, token, configs, files },
  };
}

export function revokeConnection(cfg: AppConfig, dataDir: string, id: string): AppConfig {
  const next: AppConfig = {
    ...cfg,
    connections: cfg.connections.map((c) => (c.id === id ? { ...c, revoked: true } : c)),
  };
  saveConfig(dataDir, next);
  return next;
}

export function rotateConnection(
  cfg: AppConfig,
  dataDir: string,
  projectRoot: string,
  id: string,
): { config: AppConfig; bundle: PairingBundle } | null {
  const old = cfg.connections.find((c) => c.id === id);
  if (!old) return null;
  let next = revokeConnection(cfg, dataDir, id);
  return pairLlm(next, dataDir, projectRoot, old.name, old.provider);
}
