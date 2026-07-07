#!/usr/bin/env node
// Drift check for the app registry (guards: runtime-world).
// spec/tech/architecture.md §4 is the sole authoritative home for
// app/port/basePath data. This script fails CI when a downstream copy
// disagrees with the table:
//   - apps/<app>/package.json dev script  (vite dev --port <port>)
//   - apps/<app>/vite.config.ts           (base: '/<basePath>/')
//   - gateway route map                   (apps/nxus-gateway/vite.config.ts)
//
// Usage: node scripts/check-app-registry.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname) + '/..';
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const spec = read('spec/tech/architecture.md');
const tableRows = [...spec.matchAll(
  /^\|\s*(nxus-[a-z-]+)\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|/gm,
)].map(([, app, pkg, port, basePath]) => ({ app, pkg, port: Number(port), basePath }));

if (tableRows.length === 0) {
  console.error('check-app-registry: could not parse the §4 table in spec/tech/architecture.md');
  process.exit(2);
}

const errors = [];

for (const { app, pkg, port, basePath } of tableRows) {
  const pkgJson = JSON.parse(read(`apps/${app}/package.json`));
  if (pkgJson.name !== pkg) {
    errors.push(`${app}: package name '${pkgJson.name}' != registry '${pkg}'`);
  }
  const devScript = pkgJson.scripts?.dev ?? '';
  const portMatch = devScript.match(/--port\s+(\d+)/);
  if (!portMatch || Number(portMatch[1]) !== port) {
    errors.push(`${app}: dev script port '${portMatch?.[1] ?? 'none'}' != registry ${port}`);
  }
  const vite = read(`apps/${app}/vite.config.ts`);
  const baseMatch = vite.match(/base:\s*'([^']+)'/);
  const actualBase = baseMatch ? baseMatch[1].replace(/\/$/, '') || '/' : '/';
  if (actualBase !== basePath) {
    errors.push(`${app}: vite base '${actualBase}' != registry '${basePath}'`);
  }
}

// Gateway route map: every non-root registry entry must be proxied to its port.
const gatewayVite = read('apps/nxus-gateway/vite.config.ts');
for (const { app, port, basePath } of tableRows) {
  if (basePath === '/') continue;
  const routeRe = new RegExp(`'${basePath}':\\s*\\{[^}]*port:\\s*(\\d+)`);
  const m = gatewayVite.match(routeRe);
  if (!m) {
    errors.push(`gateway: no route for '${basePath}' (${app})`);
  } else if (Number(m[1]) !== port) {
    errors.push(`gateway: route '${basePath}' -> port ${m[1]} != registry ${port}`);
  }
}

if (errors.length > 0) {
  console.error('check-app-registry: FAIL — downstream copies drifted from spec/tech/architecture.md §4:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`check-app-registry: ok (${tableRows.length} apps, ports + basePaths + gateway routes consistent)`);
