/* Chrome MCP Control Center renderer */

const pages = {
  home: { title: "Home", sub: "System status and primary controls" },
  llm: { title: "LLM Connections", sub: "Pair Grok, Claude, Codex, or generic MCP" },
  chrome: { title: "Chrome", sub: "Extension, native host, and tabs" },
  workflows: { title: "Workflows", sub: "Repeatable browser automations" },
  autofill: { title: "Autofill", sub: "Profiles and safe form filling" },
  permissions: { title: "Permissions", sub: "Safety modes and domains" },
  logs: { title: "Logs", sub: "Audit trail (redacted)" },
  diagnostics: { title: "Diagnostics", sub: "Health, repair, versions" },
  settings: { title: "Settings", sub: "Preferences and extension ID" },
  cloud: { title: "Cloud & Privacy", sub: "Data agreement and sync status" },
  wizard: { title: "Setup Wizard", sub: "Guided first-run setup" },
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}

function colorFor(state) {
  if (state === "ready" || state === "running" || state === "pass") return "green";
  if (state === "needs_attention" || state === "starting" || state === "warn") return "yellow";
  if (state === "failed" || state === "error" || state === "fail") return "red";
  return "grey";
}

function labelFor(state) {
  const map = {
    ready: "Ready",
    running: "Running",
    needs_attention: "Needs attention",
    starting: "Starting",
    failed: "Failed",
    stopped: "Stopped",
    not_configured: "Not configured",
  };
  return map[state] || String(state);
}

async function refreshHome() {
  let state = {};
  let health = {};
  try {
    state = await window.chromeMcp.get("/state");
    health = await window.chromeMcp.get("/health");
  } catch {
    state = { overall: "stopped", mcp: "stopped", lastError: "Runtime not reachable" };
  }

  const badge = document.getElementById("overall-badge");
  const detail = document.getElementById("overall-detail");
  const c = colorFor(state.overall);
  badge.className = "status-badge " + c;
  badge.textContent = "● " + labelFor(state.overall);
  detail.textContent = state.lastError
    ? state.lastError + (health.repairAction ? " — " + health.repairAction : "")
    : state.overall === "ready"
      ? "All required components passed health checks."
      : "Complete setup, then click Start All.";

  const cards = [
    ["MCP server", state.mcp],
    ["Chrome", state.chrome],
    ["Extension", state.extension],
    ["Native host", state.nativeHost],
    ["LLM", state.llm],
  ];
  document.getElementById("component-cards").innerHTML = cards
    .map(
      ([label, st]) => `
    <div class="card">
      <div class="label">${label}</div>
      <div class="value status-badge ${colorFor(st)}" style="display:inline-flex">${labelFor(st)}</div>
    </div>`,
    )
    .join("");

  document.getElementById("session-kv").innerHTML = `
    <div>Permission mode: <strong>${state.permissionMode || "—"}</strong></div>
    <div>Emergency stop: <strong>${state.emergencyStop ? "ACTIVE" : "off"}</strong></div>
    <div>Paused: <strong>${state.paused ? "yes" : "no"}</strong></div>
    <div>Current tab: <strong>${state.currentTab || "—"}</strong></div>
    <div>Active workflow: <strong>${state.activeWorkflow || "—"}</strong></div>
    <div>Last error: <strong>${state.lastError || "none"}</strong></div>
  `;

  // chrome page
  document.getElementById("chrome-status").innerHTML = `
    <div>Chrome found: <strong>${health.chrome?.found ? "yes" : "no"}</strong> ${health.chrome?.path || ""}</div>
    <div>Extension connected: <strong>${health.extension?.connected ? "yes" : "no"}</strong></div>
    <div>Extension ID: <strong>${health.extension?.extensionId || "—"}</strong></div>
    <div>Native host registered: <strong>${health.nativeHost?.registered ? "yes" : "no"}</strong></div>
    <div>Primary issue: <strong>${health.primaryFailure || "none"}</strong></div>
    <div>Repair action: <strong>${health.repairAction || "—"}</strong></div>
  `;
}

function showPage(name) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("page-" + name)?.classList.add("active");
  document.querySelector(`.nav-btn[data-page="${name}"]`)?.classList.add("active");
  document.getElementById("page-title").textContent = pages[name]?.title || name;
  document.getElementById("page-sub").textContent = pages[name]?.sub || "";
  if (name === "home" || name === "chrome" || name === "diagnostics") refreshHome();
  if (name === "llm") refreshConnections();
  if (name === "settings") refreshSettings();
  if (name === "cloud") refreshCloud();
  if (name === "wizard") renderWizard();
}

async function refreshCloud() {
  try {
    const st = await window.chromeMcp.get("/cloud/status");
    const consent = await window.chromeMcp.get("/cloud/consent");
    document.getElementById("cloud-status").innerHTML = `
      <div>Consent: <strong>${st.consent?.accepted ? "accepted" : "REQUIRED"}</strong> (v${st.consent?.version || "—"})</div>
      <div>Plan: <strong>${st.identity?.plan || "free"}</strong></div>
      <div>Pending uploads: <strong>${st.sync?.pendingCount ?? "—"}</strong></div>
      <div>Last successful sync: <strong>${st.sync?.lastSuccessAt || "never"}</strong></div>
      <div>Last error: <strong>${st.sync?.lastError || "none"}</strong></div>
      <div>User id (anonymous): <strong>${st.identity?.userId || "—"}</strong></div>
    `;
    const a = consent.agreement || {};
    document.getElementById("cloud-agreement").textContent = JSON.stringify(
      {
        collected: a.collected,
        paidExtra: a.paidExtra,
        reasons: a.reasons,
        neverCollected: a.neverCollected,
        retentionDays: a.retentionDays,
        deletion: a.deletion,
        ownerContact: a.ownerContact,
        freeNotLocalOnly: a.freeNotLocalOnly,
      },
      null,
      2,
    );
  } catch (e) {
    document.getElementById("cloud-status").textContent = String(e);
  }
}

async function refreshConnections() {
  try {
    const cfg = await window.chromeMcp.get("/config");
    const list = (cfg.connections || []).filter((c) => !c.revoked);
    document.getElementById("connections-list").innerHTML =
      list
        .map(
          (c) =>
            `<div class="card" style="margin-bottom:8px">
          <strong>${c.name}</strong> · ${c.provider}<br/>
          <span class="muted">${c.id} · created ${c.createdAt}</span><br/>
          <button class="btn" data-revoke="${c.id}">Revoke</button>
        </div>`,
        )
        .join("") || '<p class="muted">No connections yet.</p>';
    document.querySelectorAll("[data-revoke]").forEach((btn) => {
      btn.onclick = async () => {
        await window.chromeMcp.post("/control/revoke", { id: btn.getAttribute("data-revoke") });
        toast("Connection revoked");
        refreshConnections();
      };
    });
  } catch (e) {
    document.getElementById("connections-list").textContent = String(e);
  }
}

async function refreshSettings() {
  try {
    const cfg = await window.chromeMcp.get("/config");
    document.getElementById("ext-id").value = cfg.extensionId || "";
    document.getElementById("perm-mode").value = cfg.permissionMode || "ask_before_actions";
    document.getElementById("perm-low").checked = !!cfg.alwaysAllowLowRisk;
    document.getElementById("perm-computer").checked = !!cfg.computerUseEnabled;
    document.getElementById("settings-kv").innerHTML = `
      <div>Data dir: <strong id="data-dir-label">…</strong></div>
      <div>HTTP port: <strong>${cfg.httpPort}</strong></div>
      <div>Wizard completed: <strong>${cfg.wizardCompleted}</strong></div>
    `;
    const dd = await window.chromeMcp.dataDir();
    document.getElementById("data-dir-label").textContent = dd;
  } catch (e) {
    toast(String(e));
  }
}

// Wizard
let wizStep = 0;
const wizSteps = [
  {
    title: "Data processing agreement",
    body: "Operational data is synchronized to improve the MCP (errors, failures, versions, domains). Free is not local-only for diagnostics. Passwords and secrets are never uploaded. You must accept to continue.",
    action: async () => {
      const c = await window.chromeMcp.get("/cloud/consent");
      return JSON.stringify(c.agreement, null, 2);
    },
  },
  {
    title: "System check",
    body: "We check Windows, Chrome, storage, and local services.",
    action: async () => {
      const h = await window.chromeMcp.get("/health");
      return `Platform: ${h.versions?.platform}\nChrome: ${h.chrome?.found ? "found" : "missing"}\nDisk: ${h.disk?.ok ? "ok" : "fail"}`;
    },
  },
  {
    title: "Chrome connection",
    body: "Install the extension (Load unpacked) and register Native Messaging.",
    action: async () => {
      const p = await window.chromeMcp.extensionPath();
      await window.chromeMcp.post("/control/repair");
      return `Extension folder:\n${p}\n\nChrome → Extensions → Developer mode → Load unpacked.\nThen click Repair if needed.`;
    },
  },
  {
    title: "LLM pairing",
    body: "Generate a secure connection for your AI app.",
    action: async () => {
      const r = await window.chromeMcp.post("/control/pair", { name: "wizard-grok", provider: "grok" });
      return `Paired. Token (copy now):\n${r.token}\n\nGrok config:\n${r.configs?.grok || ""}`;
    },
  },
  {
    title: "Safety mode",
    body: "Recommended: Ask before actions.",
    action: async () => "Default safety mode will be Ask before actions. Change later under Permissions.",
  },
  {
    title: "Demo test",
    body: "Safe local demonstration using mock bridge if Chrome is not connected yet.",
    action: async () => {
      await window.chromeMcp.post("/control/start");
      const tools = await window.chromeMcp.get("/mcp/tools");
      const call = await window.chromeMcp.post("/mcp/call", {
        name: "browser_list_tabs",
        arguments: {},
      });
      return `Tools available: ${tools.tools?.length}\nlist_tabs ok=${call.ok}\n${JSON.stringify(call.data || call.error, null, 2)}`;
    },
  },
  {
    title: "Complete",
    body: "You are ready. Use Start All from Home for daily use.",
    action: async () => {
      await window.chromeMcp.post("/control/config", {
        wizardCompleted: true,
        permissionMode: "ask_before_actions",
      });
      return "Setup complete. Click Start All on the Home page.";
    },
  },
];

async function renderWizard() {
  const s = wizSteps[wizStep];
  let extra = "";
  try {
    extra = await s.action();
  } catch (e) {
    extra = String(e);
  }
  document.getElementById("wizard-step").innerHTML = `
    <p><strong>Step ${wizStep + 1} of ${wizSteps.length}: ${s.title}</strong></p>
    <p>${s.body}</p>
    <pre class="code">${extra}</pre>
  `;
}

// Wire UI
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

document.getElementById("btn-start").onclick = async () => {
  try {
    toast("Starting… Chrome may relaunch once to load the extension");
    const s = await window.chromeMcp.post("/control/start");
    toast(
      s.overall === "ready"
        ? "Ready — extension connected"
        : "Start All: " + labelFor(s.overall) + (s.lastError ? " — " + s.lastError : ""),
    );
    refreshHome();
  } catch (e) {
    toast("Start failed: " + e.message);
  }
};
document.getElementById("btn-stop").onclick = async () => {
  await window.chromeMcp.post("/control/stop");
  toast("Stopped — Chrome left open");
  refreshHome();
};
document.getElementById("btn-pause").onclick = async () => {
  await window.chromeMcp.post("/control/pause");
  toast("Automation paused");
  refreshHome();
};
document.getElementById("btn-emergency").onclick = async () => {
  await window.chromeMcp.post("/control/emergency");
  toast("EMERGENCY STOP — all actions blocked");
  refreshHome();
};
document.getElementById("btn-health").onclick = async () => {
  const h = await window.chromeMcp.get("/health");
  toast(h.ok ? "Health OK" : h.primaryFailure || "Needs attention");
  refreshHome();
};
document.getElementById("btn-repair").onclick = async () => {
  const r = await window.chromeMcp.post("/control/repair");
  toast(r.message || "Repair done");
  refreshHome();
};
document.getElementById("btn-pair").onclick = () => showPage("llm");
document.getElementById("btn-pair-create").onclick = async () => {
  const name = document.getElementById("pair-name").value || "client";
  const provider = document.getElementById("pair-provider").value;
  const r = await window.chromeMcp.post("/control/pair", { name, provider });
  document.getElementById("pair-output").textContent =
    `Token (save now):\n${r.token}\n\n` + (r.configs?.[provider] || r.configs?.generic || "");
  refreshConnections();
  toast("Paired " + name);
};
document.getElementById("btn-connect-chrome").onclick = async () => {
  try {
    toast("Connecting… Chrome will relaunch if needed");
    const r = await window.chromeMcp.post("/control/connect-chrome");
    if (r.ok) {
      toast(
        r.relaunched
          ? "Extension connected (Chrome relaunched)"
          : "Extension connected",
      );
    } else {
      toast((r.repairAction || r.error || "Connect failed") + (r.steps ? " · " + r.steps.slice(-1)[0] : ""));
    }
    refreshHome();
  } catch (e) {
    toast("Connect failed: " + e.message);
  }
};
document.getElementById("btn-open-ext").onclick = async () => {
  await window.chromeMcp.openPath(await window.chromeMcp.extensionPath());
};
document.getElementById("btn-repair-nm").onclick = async () => {
  const r = await window.chromeMcp.post("/control/repair");
  toast(r.message || "Repaired");
  refreshHome();
};
document.getElementById("btn-refresh-health").onclick = () => refreshHome();
document.getElementById("btn-diag-run").onclick = async () => {
  const h = await window.chromeMcp.get("/health");
  document.getElementById("diag-out").textContent = JSON.stringify(h, null, 2);
};
document.getElementById("btn-diag-repair").onclick = async () => {
  const r = await window.chromeMcp.post("/control/repair");
  document.getElementById("diag-out").textContent = JSON.stringify(r, null, 2);
};
document.getElementById("btn-open-logs").onclick = async () => {
  await window.chromeMcp.openPath(await window.chromeMcp.dataDir());
};
document.getElementById("btn-save-settings").onclick = async () => {
  const id = document.getElementById("ext-id").value.trim();
  await window.chromeMcp.post("/control/config", { extensionId: id });
  await window.chromeMcp.post("/control/repair");
  toast("Settings saved and Native Messaging repair attempted");
  refreshSettings();
};
document.getElementById("btn-save-perm").onclick = async () => {
  await window.chromeMcp.post("/control/config", {
    permissionMode: document.getElementById("perm-mode").value,
    alwaysAllowLowRisk: document.getElementById("perm-low").checked,
    computerUseEnabled: document.getElementById("perm-computer").checked,
  });
  toast("Permissions saved");
};
document.getElementById("btn-accept-consent").onclick = async () => {
  await window.chromeMcp.post("/cloud/consent", { accept: true, plan: "free" });
  toast("Data agreement accepted — operational sync enabled");
  refreshCloud();
};
document.getElementById("btn-cloud-flush").onclick = async () => {
  const r = await window.chromeMcp.post("/cloud/flush");
  toast(
    r.result
      ? `Synced: uploaded ${r.result.uploaded}, failed ${r.result.failed}`
      : "Sync finished",
  );
  refreshCloud();
};
document.getElementById("btn-cloud-delete").onclick = async () => {
  if (!confirm("Delete your cloud account data? Local history can remain on this PC.")) return;
  const r = await window.chromeMcp.post("/cloud/delete-account");
  toast(r.ok ? "Cloud data delete requested" : r.error || "Delete failed");
  refreshCloud();
};

document.getElementById("wiz-back").onclick = () => {
  wizStep = Math.max(0, wizStep - 1);
  renderWizard();
};
document.getElementById("wiz-next").onclick = async () => {
  // Step 0 = DPA — require accept
  if (wizStep === 0) {
    try {
      await window.chromeMcp.post("/cloud/consent", { accept: true, plan: "free" });
      toast("Agreement accepted");
    } catch (e) {
      toast("You must accept the data agreement: " + e.message);
      return;
    }
  }
  if (wizStep >= wizSteps.length - 1) {
    showPage("home");
    toast("Wizard finished");
    return;
  }
  wizStep++;
  renderWizard();
};

window.chromeMcp.onRuntimeStatus((s) => {
  document.getElementById("runtime-pill").textContent = "Runtime: " + s.status + (s.message ? " — " + s.message : "");
});

// boot
showPage("home");
refreshHome();
window.chromeMcp.runtimeStatus().then((s) => {
  document.getElementById("runtime-pill").textContent = "Runtime: " + s.status;
});
setInterval(refreshHome, 5000);
