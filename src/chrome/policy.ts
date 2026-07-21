/**
 * User-level Chrome policies to force-install our local extension.
 * Works when --load-extension is removed (Chrome 137+ / 150).
 */

import { execSync } from "node:child_process";

export interface PolicyResult {
  steps: string[];
  ok: boolean;
}

function regAdd(args: string): void {
  execSync(`reg add ${args}`, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}

/**
 * Install HKCU policies for force-install from local update.xml.
 */
export function applyForceInstallPolicy(extensionId: string, updateUrl: string): PolicyResult {
  const steps: string[] = [];
  if (process.platform !== "win32") {
    return { steps: ["Non-Windows: skip policy"], ok: false };
  }
  try {
    // Allow install sources: file + loopback HTTP
    regAdd(
      `"HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources" /v 1 /t REG_SZ /d "file:///*" /f`,
    );
    steps.push("Set ExtensionInstallSources file:///*");

    regAdd(
      `"HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources" /v 2 /t REG_SZ /d "http://127.0.0.1/*" /f`,
    );
    regAdd(
      `"HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources" /v 3 /t REG_SZ /d "http://localhost/*" /f`,
    );

    // Force install list: id;update_url
    const entry = `${extensionId};${updateUrl}`;
    regAdd(
      `"HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "${entry}" /f`,
    );
    steps.push(`Set ExtensionInstallForcelist ${entry}`);

    // ExtensionSettings force_installed (newer Chrome)
    const settings = JSON.stringify({
      [extensionId]: {
        installation_mode: "force_installed",
        update_url: updateUrl,
        toolbar_pin: "default_unpinned",
      },
    });
    // Escape quotes for reg
    const escaped = settings.replace(/"/g, '\\"');
    try {
      regAdd(
        `"HKCU\\Software\\Policies\\Google\\Chrome" /v ExtensionSettings /t REG_SZ /d "${escaped}" /f`,
      );
      steps.push("Set ExtensionSettings force_installed");
    } catch (e) {
      steps.push(`ExtensionSettings optional failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { steps, ok: true };
  } catch (e) {
    steps.push(`Policy failed: ${e instanceof Error ? e.message : String(e)}`);
    return { steps, ok: false };
  }
}

export function clearForceInstallPolicy(): string[] {
  const steps: string[] = [];
  if (process.platform !== "win32") return steps;
  try {
    execSync(
      `reg delete "HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /f`,
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    steps.push("Cleared ExtensionInstallForcelist");
  } catch {
    steps.push("No ExtensionInstallForcelist to clear");
  }
  return steps;
}
