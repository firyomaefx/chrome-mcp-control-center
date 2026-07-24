/**
 * Loopback port conflict detection + free port selection.
 */

import net from "node:net";

export function canBind(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    try {
      srv.listen(port, host);
    } catch {
      resolve(false);
    }
  });
}

/** Find a free port in [start, start+range). */
export async function findFreePort(
  start = 18787,
  range = 40,
  host = "127.0.0.1",
): Promise<number | null> {
  for (let p = start; p < start + range; p++) {
    if (await canBind(p, host)) return p;
  }
  return null;
}

export async function ensurePortAvailable(
  preferred: number,
): Promise<{ port: number; conflict: boolean; changed: boolean }> {
  if (await canBind(preferred)) {
    return { port: preferred, conflict: false, changed: false };
  }
  const free = await findFreePort(preferred, 40);
  if (free == null) {
    return { port: preferred, conflict: true, changed: false };
  }
  return { port: free, conflict: true, changed: free !== preferred };
}
