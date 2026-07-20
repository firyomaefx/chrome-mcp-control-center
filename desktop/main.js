/**
 * Electron main process — Chrome MCP Control Center
 * Supervises local HTTP runtime and shows the dashboard UI.
 */

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const HTTP_PORT = Number(process.env.CHROME_MCP_HTTP_PORT || 18787);
let win = null;
let tray = null;
let runtimeProc = null;
let runtimeStatus = "stopped";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

function dataDir() {
  if (process.env.CHROME_MCP_DATA_DIR) return process.env.CHROME_MCP_DATA_DIR;
  return path.join(app.getPath("userData"), "data");
}

function runtimeScript() {
  if (app.isPackaged) return path.join(process.resourcesPath, "runtime-bundle.mjs");
  return path.join(__dirname, "runtime-bundle.mjs");
}

function baseUrl() {
  return `http://127.0.0.1:${HTTP_PORT}`;
}

function post(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl()}${pathname}`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end("{}");
  });
}

function get(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl()}${pathname}`, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function startRuntime() {
  if (runtimeProc) return;
  const script = runtimeScript();
  if (!fs.existsSync(script)) {
    runtimeStatus = "failed";
    send("runtime:status", {
      status: runtimeStatus,
      message: app.isPackaged
        ? "Runtime missing — reinstall the app."
        : "Run npm run build && npm run bundle:runtime first.",
    });
    return;
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  runtimeStatus = "starting";
  send("runtime:status", { status: runtimeStatus, message: "Starting services…" });

  runtimeProc = spawn(process.execPath, [script, "serve-http", "--mock"], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      CHROME_MCP_DATA_DIR: dataDir(),
      CHROME_MCP_HTTP_PORT: String(HTTP_PORT),
      CHROME_MCP_MOCK: process.env.CHROME_MCP_MOCK || "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  runtimeProc.stdout.on("data", (d) => console.log("[runtime]", d.toString()));
  runtimeProc.stderr.on("data", (d) => {
    const s = d.toString();
    console.error("[runtime]", s);
    if (s.includes("listening")) {
      runtimeStatus = "running";
      send("runtime:status", { status: runtimeStatus, message: "Services running", url: baseUrl() });
    }
  });
  runtimeProc.on("exit", (code) => {
    runtimeProc = null;
    if (runtimeStatus !== "stopped") {
      runtimeStatus = "failed";
      send("runtime:status", { status: runtimeStatus, message: `Runtime exited (${code})` });
    }
  });

  // poll health
  let n = 0;
  const t = setInterval(() => {
    if (n++ > 30 || runtimeStatus === "running") {
      clearInterval(t);
      return;
    }
    get("/health")
      .then(() => {
        runtimeStatus = "running";
        send("runtime:status", { status: runtimeStatus, message: "Services running", url: baseUrl() });
        clearInterval(t);
      })
      .catch(() => {});
  }, 400);
}

function stopRuntime() {
  runtimeStatus = "stopped";
  if (runtimeProc) {
    try {
      runtimeProc.kill();
    } catch {
      /* ignore */
    }
    runtimeProc = null;
  }
  send("runtime:status", { status: runtimeStatus, message: "Stopped" });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: "Chrome MCP Control Center",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("closed", () => {
    win = null;
  });
}

function createTray() {
  const img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("Chrome MCP Control Center");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => win?.show() },
      { label: "Emergency Stop", click: () => post("/control/emergency").catch(() => {}) },
      { type: "separator" },
      { label: "Quit", click: () => { stopRuntime(); app.quit(); } },
    ]),
  );
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startRuntime();

  ipcMain.handle("api:get", async (_e, pathname) => get(pathname));
  ipcMain.handle("api:post", async (_e, pathname, body) => {
    if (!body) return post(pathname);
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        `${baseUrl()}${pathname}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  });
  ipcMain.handle("shell:open", async (_e, p) => shell.openPath(p));
  ipcMain.handle("shell:openExternal", async (_e, url) => shell.openExternal(url));
  ipcMain.handle("app:dataDir", async () => dataDir());
  ipcMain.handle("app:extensionPath", async () => {
    if (app.isPackaged) return path.join(process.resourcesPath, "extension");
    return path.join(__dirname, "..", "extension");
  });
  ipcMain.handle("runtime:status", async () => ({ status: runtimeStatus, url: baseUrl() }));
});

app.on("window-all-closed", () => {
  // keep tray; do not quit on Windows close optional — quit for simplicity
  stopRuntime();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => stopRuntime());
