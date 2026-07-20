const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chromeMcp", {
  get: (pathname) => ipcRenderer.invoke("api:get", pathname),
  post: (pathname, body) => ipcRenderer.invoke("api:post", pathname, body),
  openPath: (p) => ipcRenderer.invoke("shell:open", p),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  dataDir: () => ipcRenderer.invoke("app:dataDir"),
  extensionPath: () => ipcRenderer.invoke("app:extensionPath"),
  runtimeStatus: () => ipcRenderer.invoke("runtime:status"),
  onRuntimeStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("runtime:status", listener);
    return () => ipcRenderer.removeListener("runtime:status", listener);
  },
});
