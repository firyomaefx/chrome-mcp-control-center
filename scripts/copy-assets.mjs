import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// placeholder for future asset copies
const marker = path.join(root, "dist", ".assets-ok");
fs.mkdirSync(path.dirname(marker), { recursive: true });
fs.writeFileSync(marker, new Date().toISOString());
console.log("assets ok");
