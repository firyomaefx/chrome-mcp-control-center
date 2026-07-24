/**
 * Chrome Native Messaging host.
 * Reads length-prefixed JSON from stdin; writes same format to stdout.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { defaultDataDir, ensureDataDirs, loadConfig } from "../config.js";
import { bridge } from "../browser/bridge.js";
import { APP_VERSION } from "../version.js";

const MAX = 1024 * 1024;

function log(msg: string): void {
  try {
    const dir = path.join(defaultDataDir(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "native-host.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignore */
  }
}

function readMessage(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const header = Buffer.alloc(4);
    let headerRead = 0;

    const onReadable = () => {
      // read header
      while (headerRead < 4) {
        const n = process.stdin.read(4 - headerRead);
        if (!n) return;
        n.copy(header, headerRead);
        headerRead += n.length;
      }
      const len = header.readUInt32LE(0);
      if (len <= 0 || len > MAX) {
        log(`invalid length ${len}`);
        resolve(null);
        process.stdin.off("readable", onReadable);
        return;
      }
      const body = Buffer.alloc(len);
      let bodyRead = 0;
      const readBody = () => {
        while (bodyRead < len) {
          const n = process.stdin.read(len - bodyRead);
          if (!n) return;
          n.copy(body, bodyRead);
          bodyRead += n.length;
        }
        process.stdin.off("readable", onReadable);
        try {
          resolve(JSON.parse(body.toString("utf8")));
        } catch {
          resolve(null);
        }
      };
      // continue with same readable
      const prev = onReadable;
      process.stdin.off("readable", prev);
      const bodyHandler = () => readBody();
      process.stdin.on("readable", bodyHandler);
      readBody();
    };

    process.stdin.on("readable", onReadable);
    // kick
    onReadable();
  });
}

function writeMessage(msg: unknown): void {
  const json = Buffer.from(JSON.stringify(msg), "utf8");
  if (json.length > MAX) {
    log("response too large");
    return;
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

async function main(): Promise<void> {
  ensureDataDirs(defaultDataDir());
  log(`host start pid=${process.pid} platform=${os.platform()}`);
  const cfg = loadConfig(defaultDataDir());

  // Mark connected when we receive first message from extension
  for (;;) {
    const msg = await new Promise<unknown | null>((resolve) => {
      // simpler blocking read loop using chunks
      const chunks: Buffer[] = [];
      let needed = 4;
      let mode: "h" | "b" = "h";
      let bodyLen = 0;

      const tryParse = () => {
        /* handled inline */
      };

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        let buf = Buffer.concat(chunks);
        chunks.length = 0;
        while (true) {
          if (mode === "h") {
            if (buf.length < 4) {
              chunks.push(buf);
              return;
            }
            bodyLen = buf.readUInt32LE(0);
            if (bodyLen <= 0 || bodyLen > MAX) {
              log(`bad len ${bodyLen}`);
              process.exit(1);
            }
            buf = buf.subarray(4);
            mode = "b";
          }
          if (mode === "b") {
            if (buf.length < bodyLen) {
              chunks.push(buf);
              return;
            }
            const body = buf.subarray(0, bodyLen);
            buf = buf.subarray(bodyLen);
            mode = "h";
            process.stdin.off("data", onData);
            if (buf.length) chunks.push(buf);
            try {
              resolve(JSON.parse(body.toString("utf8")));
            } catch {
              resolve(null);
            }
            return;
          }
        }
      };
      process.stdin.on("data", onData);
      process.stdin.on("end", () => resolve(null));
    });

    if (msg === null) {
      log("stdin end");
      break;
    }

    bridge.setConnected(true);
    const m = msg as Record<string, unknown>;

    // Validate origin-like field if present
    if (typeof m.extensionId === "string" && cfg.extensionId && m.extensionId !== cfg.extensionId) {
      writeMessage({ id: m.id, ok: false, error: "extension id mismatch" });
      continue;
    }

    if (m.type === "hello" || m.type === "heartbeat") {
      writeMessage({ id: m.id ?? "hello", ok: true, type: "response", data: { version: APP_VERSION } });
      continue;
    }

    if (m.type === "response") {
      bridge.handleExtensionMessage(m);
      continue;
    }

    // Extension requesting host to run? Usually host pushes commands.
    // Extension may also post events:
    if (m.type === "event") {
      log(`event ${JSON.stringify(m.event)}`);
      writeMessage({ id: m.id, ok: true, type: "response" });
      continue;
    }

    // Command from extension side for status
    if (m.type === "get_status") {
      writeMessage({
        id: m.id,
        ok: true,
        type: "response",
        data: { host: "chrome-mcp", emergencyStop: cfg.emergencyStop },
      });
      continue;
    }

    writeMessage({ id: m.id, ok: false, type: "response", error: "unknown message type" });
  }
}

// Simpler robust main using async iterator style
async function run(): Promise<void> {
  ensureDataDirs(defaultDataDir());
  log("native host running");

  process.stdin.on("end", () => process.exit(0));

  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (buffer.length < 4) return;
      const len = buffer.readUInt32LE(0);
      if (len > MAX) {
        log(`message too large ${len}`);
        process.exit(1);
      }
      if (buffer.length < 4 + len) return;
      const body = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      } catch {
        continue;
      }
      bridge.setConnected(true);
      const cfg = loadConfig(defaultDataDir());
      if (msg.type === "hello" || msg.type === "heartbeat" || msg.type === "get_status") {
        writeMessage({
          id: msg.id ?? "ok",
          ok: true,
          type: "response",
          data: { version: APP_VERSION, emergencyStop: cfg.emergencyStop },
        });
      } else if (msg.type === "response") {
        bridge.handleExtensionMessage(msg);
      } else if (msg.type === "event") {
        writeMessage({ id: msg.id, ok: true, type: "response" });
      } else {
        writeMessage({ id: msg.id, ok: false, type: "response", error: "unknown type" });
      }
    }
  });
}

run().catch((e) => {
  log(String(e));
  process.exit(1);
});
