// Fails the build if the API mock (MSW worker, handlers) leaked into the client bundle. The mock is only
// reachable through a dynamic import guarded by NODE_ENV === "development" && NEXT_PUBLIC_API_MOCK === "1"
// (src/mocks/mock-boot.tsx); this guards that invariant for every production build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), ".next");
const markers = ["mswjs.io", "rodrigo@example.com", "mock-session", "startMockWorker"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(js|mjs)$/.test(entry)) out.push(path);
  }
  return out;
}

const offenders = [];
for (const file of walk(join(root, "static"))) {
  const source = readFileSync(file, "utf8");
  for (const marker of markers) {
    if (source.includes(marker)) offenders.push(`${file} contains "${marker}"`);
  }
}

if (offenders.length > 0) {
  console.error("API mock leaked into the production bundle:\n" + offenders.join("\n"));
  process.exit(1);
}
process.stdout.write("assert-no-mocks-in-bundle: ok\n");
