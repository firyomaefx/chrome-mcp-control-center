function paint(status) {
  const el = document.getElementById("status");
  const auto = document.getElementById("auto");
  const err = document.getElementById("err");
  if (!status) {
    el.textContent = "Unknown";
    el.className = "status grey";
    return;
  }
  if (status.connected) {
    el.textContent = status.automationActive ? "Connected · Automation active" : "Connected";
    el.className = "status " + (status.automationActive ? "yellow" : "green");
  } else {
    el.textContent = "Disconnected";
    el.className = "status red";
  }
  auto.textContent = status.automationActive ? "Active" : "Idle";
  err.textContent = status.lastError || "none";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "get_status" }, (status) => paint(status));
}

document.getElementById("reconnect").onclick = () => {
  chrome.runtime.sendMessage({ type: "reconnect" }, () => setTimeout(refresh, 500));
};
document.getElementById("pause").onclick = () => {
  chrome.runtime.sendMessage({ type: "pause" }, () => refresh());
};

refresh();
setInterval(refresh, 2000);
