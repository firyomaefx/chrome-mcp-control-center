/**
 * Chrome MCP extension — HTTP loopback control plane + optional Native Messaging.
 * Registers immediately, retries fast, alarms keep service worker alive.
 */

const HOST_NAME = "com.chromemcp.controlcenter";
const MAX_TEXT = 200_000;
const DEFAULT_PORT = 18787;
const PORT_CANDIDATES = [18787, 18788, 18789, 19887];

let httpBase = `http://127.0.0.1:${DEFAULT_PORT}`;
let connected = false;
let automationActive = false;
let lastError = null;
let nativePort = null;
let pollAbort = false;

function setStatus(partial) {
  chrome.storage.local.set({
    status: {
      connected,
      automationActive,
      lastError,
      httpBase,
      extensionId: chrome.runtime.id,
      updatedAt: new Date().toISOString(),
      ...partial,
    },
  });
  try {
    chrome.action.setBadgeText({ text: connected ? (automationActive ? "ON" : "OK") : "!" });
    chrome.action.setBadgeBackgroundColor({
      color: connected ? (automationActive ? "#c2410c" : "#15803d") : "#b91c1c",
    });
  } catch {
    /* ignore */
  }
}

async function loadPort() {
  const stored = await chrome.storage.local.get(["httpPort"]);
  const port = Number(stored.httpPort || DEFAULT_PORT);
  httpBase = `http://127.0.0.1:${port}`;
}

async function httpJson(pathname, opts = {}) {
  const res = await fetch(`${httpBase}${pathname}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { ok: false, error: text };
  }
}

async function tryRegisterOnPort(port) {
  httpBase = `http://127.0.0.1:${port}`;
  const r = await httpJson("/extension/register", {
    method: "POST",
    body: JSON.stringify({ extensionId: chrome.runtime.id }),
  });
  if (r && r.ok) {
    await chrome.storage.local.set({ httpPort: port });
    return true;
  }
  return false;
}

async function register() {
  try {
    await loadPort();
    // Try stored port first, then candidates
    const stored = await chrome.storage.local.get(["httpPort"]);
    const order = [
      Number(stored.httpPort || DEFAULT_PORT),
      ...PORT_CANDIDATES.filter((p) => p !== Number(stored.httpPort || DEFAULT_PORT)),
    ];
    for (const port of order) {
      try {
        if (await tryRegisterOnPort(port)) {
          connected = true;
          lastError = null;
          setStatus({});
          return true;
        }
      } catch {
        /* try next */
      }
    }
    connected = false;
    lastError = "Control Center not reachable on 127.0.0.1";
    setStatus({});
    return false;
  } catch (e) {
    connected = false;
    lastError = String(e);
    setStatus({});
    return false;
  }
}

async function pollLoop() {
  while (!pollAbort) {
    try {
      if (!connected) {
        await register();
        if (!connected) {
          await sleep(1500);
          continue;
        }
      }
      const r = await httpJson("/extension/poll?waitMs=12000", { method: "GET" });
      connected = true;
      lastError = null;
      setStatus({});
      const cmd = r.command;
      if (!cmd) continue;
      automationActive = true;
      setStatus({});
      try {
        const data = await handleCommand(cmd.type, cmd.payload || {});
        await httpJson("/extension/result", {
          method: "POST",
          body: JSON.stringify({ id: cmd.id, ok: true, data }),
        });
      } catch (e) {
        await httpJson("/extension/result", {
          method: "POST",
          body: JSON.stringify({
            id: cmd.id,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          }),
        });
      } finally {
        automationActive = false;
        setStatus({});
      }
    } catch (e) {
      connected = false;
      lastError = String(e);
      setStatus({});
      await sleep(1500);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectNative() {
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    nativePort.onMessage.addListener((msg) => {
      if (msg && msg.type && msg.type !== "response" && msg.id) {
        handleCommand(msg.type, msg.payload || {})
          .then((data) => nativePort?.postMessage({ type: "response", id: msg.id, ok: true, data }))
          .catch((e) =>
            nativePort?.postMessage({
              type: "response",
              id: msg.id,
              ok: false,
              error: String(e),
            }),
          );
      }
    });
    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
    });
    nativePort.postMessage({
      type: "hello",
      id: "hello-" + Date.now(),
      extensionId: chrome.runtime.id,
    });
  } catch {
    nativePort = null;
  }
}

async function handleCommand(type, payload) {
  switch (type) {
    case "list_tabs": {
      const tabs = await chrome.tabs.query({});
      return {
        tabs: tabs.map((t) => ({
          id: t.id,
          windowId: t.windowId,
          title: t.title,
          url: t.url,
          active: t.active,
          status: t.status,
        })),
      };
    }
    case "list_windows": {
      const windows = await chrome.windows.getAll();
      return {
        windows: windows.map((w) => ({ id: w.id, focused: w.focused, state: w.state })),
      };
    }
    case "get_active_tab": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { tab: tab ? { id: tab.id, title: tab.title, url: tab.url, active: true } : null };
    }
    case "focus_tab": {
      await chrome.tabs.update(payload.tabId, { active: true });
      return { focused: payload.tabId };
    }
    case "read_page": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPage,
        args: [MAX_TEXT],
      });
      return { tabId, ...result };
    }
    case "a11y_tree": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractA11y,
      });
      return { tabId, tree: result };
    }
    case "find_elements": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: findElements,
        args: [payload],
      });
      return { elements: result };
    }
    case "click": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: clickEl,
        args: [payload.selector],
      });
      if (!result?.ok) throw new Error(result?.error || "click failed");
      return result;
    }
    case "type": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: typeEl,
        args: [payload.selector, payload.text, !!payload.clear],
      });
      if (!result?.ok) throw new Error(result?.error || "type failed");
      return result;
    }
    case "scroll": {
      const tabId = payload.tabId || (await activeTabId());
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (x, y, sel) => {
          if (sel) {
            const el = document.querySelector(sel);
            if (el) el.scrollIntoView({ block: "center" });
          } else {
            window.scrollBy(x || 0, y || 0);
          }
        },
        args: [payload.x || 0, payload.y || 0, payload.selector || null],
      });
      return { scrolled: true };
    }
    case "screenshot": {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      const base64 = dataUrl.split(",")[1] || "";
      return { base64 };
    }
    case "open_url": {
      const tab = await chrome.tabs.create({ url: payload.url });
      return { tabId: tab.id, url: payload.url };
    }
    case "create_tab": {
      const tab = await chrome.tabs.create({ url: payload.url || "chrome://newtab" });
      return { tabId: tab.id };
    }
    case "close_tab": {
      await chrome.tabs.remove(payload.tabId);
      return { closed: payload.tabId };
    }
    case "reload": {
      const tabId = payload.tabId || (await activeTabId());
      await chrome.tabs.reload(tabId);
      return { reloaded: tabId };
    }
    case "go_back": {
      const tabId = payload.tabId || (await activeTabId());
      await chrome.tabs.goBack(tabId);
      return { ok: true };
    }
    case "go_forward": {
      const tabId = payload.tabId || (await activeTabId());
      await chrome.tabs.goForward(tabId);
      return { ok: true };
    }
    case "extract_links": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
          [...document.querySelectorAll("a[href]")].slice(0, 200).map((a) => ({
            href: a.href,
            text: (a.innerText || "").slice(0, 120),
          })),
      });
      return { links: result };
    }
    case "select_option":
    case "clear_field":
    case "check":
    case "uncheck":
    case "hover":
    case "wait_for": {
      const tabId = payload.tabId || (await activeTabId());
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: genericDom,
        args: [type, payload],
      });
      if (result && result.ok === false) throw new Error(result.error || "failed");
      return result || { ok: true };
    }
    default:
      throw new Error("Unsupported command: " + type);
  }
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return tab.id;
}

function extractPage(maxText) {
  const forms = [...document.forms].map((f, i) => ({
    name: f.name || f.id || "form_" + i,
    fields: [...f.elements]
      .filter((el) => el.name || el.id)
      .map((el) => ({
        name: el.name || el.id,
        type: el.type || el.tagName.toLowerCase(),
        label: el.labels?.[0]?.innerText || el.getAttribute("aria-label") || "",
      })),
  }));
  const text = (document.body?.innerText || "").slice(0, maxText);
  return {
    title: document.title,
    url: location.href,
    text,
    htmlSnippet: document.body?.innerHTML?.slice(0, 5000) || "",
    forms,
  };
}

function extractA11y() {
  const nodes = [];
  const walk = (el, depth) => {
    if (!el || depth > 8 || nodes.length > 200) return;
    const role = el.getAttribute?.("role") || el.tagName?.toLowerCase();
    const name =
      el.getAttribute?.("aria-label") ||
      el.innerText?.trim()?.slice(0, 80) ||
      el.getAttribute?.("name") ||
      "";
    if (role && name) {
      nodes.push({ role, name, selector: el.id ? "#" + el.id : role });
    }
    for (const c of el.children || []) walk(c, depth + 1);
  };
  walk(document.body, 0);
  return nodes;
}

function findElements(payload) {
  const out = [];
  if (payload.selector) {
    document.querySelectorAll(payload.selector).forEach((el, i) => {
      if (i < 20)
        out.push({
          selector: payload.selector,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || "").slice(0, 80),
          role: el.getAttribute("role"),
          interactable: !el.disabled,
        });
    });
  }
  if (payload.text) {
    const needle = String(payload.text).toLowerCase();
    document.querySelectorAll("button, a, [role=button], input, label").forEach((el) => {
      const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").toLowerCase();
      if (t.includes(needle) && out.length < 20) {
        out.push({
          selector: el.id ? "#" + el.id : el.tagName.toLowerCase(),
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || "").slice(0, 80),
          role: el.getAttribute("role") || el.tagName.toLowerCase(),
          interactable: !el.disabled,
        });
      }
    });
  }
  return out;
}

function clickEl(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: "ELEMENT_NOT_FOUND" };
  el.scrollIntoView({ block: "center", inline: "center" });
  el.click();
  return { ok: true, clicked: true, selector, method: "dom" };
}

function typeEl(selector, text, clear) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: "ELEMENT_NOT_FOUND" };
  el.focus();
  if (clear) el.value = "";
  el.value = (el.value || "") + text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, typed: true, selector };
}

function genericDom(type, payload) {
  const el = payload.selector ? document.querySelector(payload.selector) : null;
  if (payload.selector && !el) return { ok: false, error: "ELEMENT_NOT_FOUND" };
  if (type === "select_option") {
    el.value = payload.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  if (type === "clear_field") {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true };
  }
  if (type === "check") {
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  if (type === "uncheck") {
    el.checked = false;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  if (type === "hover") {
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    return { ok: true };
  }
  if (type === "wait_for") {
    return { ok: !!el, found: !!el };
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "get_status") {
    chrome.storage.local.get("status", (r) => sendResponse(r.status || { connected }));
    return true;
  }
  if (msg?.type === "pause") {
    automationActive = false;
    setStatus({});
    sendResponse({ ok: true });
  }
  if (msg?.type === "reconnect") {
    register().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "set_port") {
    chrome.storage.local.set({ httpPort: Number(msg.port) || DEFAULT_PORT }, () => {
      loadPort().then(() => register()).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
  return false;
});

// Keep SW alive and re-register
chrome.alarms.create("chrome-mcp-heartbeat", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "chrome-mcp-heartbeat") {
    register().catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  register();
});
chrome.runtime.onStartup.addListener(() => {
  register();
});

// Boot
pollAbort = false;
register().then(() => {
  connectNative();
  pollLoop();
});
setInterval(() => {
  httpJson("/extension/heartbeat", {
    method: "POST",
    body: JSON.stringify({ extensionId: chrome.runtime.id }),
  }).catch(() => {
    connected = false;
    setStatus({});
  });
}, 10000);
