import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { z } from 'zod';

const rootDir = process.cwd();
const agentHubDir = path.join(rootDir, 'agent-hub');
const skillsSourceDir = path.join(agentHubDir, 'skills');
const mcpConfigPath = path.join(agentHubDir, 'mcp', 'servers.json');
const generatedDir = path.join(agentHubDir, 'generated');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const applyCodexHome = args.has('--apply-codex-home');

const skillTargetSchema = z.object({
  claude: z.boolean().default(true),
  codex: z.boolean().default(true),
  gemini: z.boolean().default(true),
});

const stdioServerSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().min(1).optional(),
});

const sseServerSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
});

const httpServerSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  bearerTokenEnvVar: z.string().min(1).optional(),
});

const mcpServerSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  targets: skillTargetSchema.default({}),
  transport: z.discriminatedUnion('type', [
    stdioServerSchema,
    sseServerSchema,
    httpServerSchema,
  ]),
});

const mcpConfigSchema = z.object({
  schemaVersion: z.literal(1),
  servers: z.array(mcpServerSchema).default([]),
});

const managedSkillsSchema = z.object({
  schemaVersion: z.literal(1),
  managedSkills: z.array(z.string()).default([]),
});

const skillTargets = [
  {
    name: 'claude',
    skillsDir: path.join(rootDir, '.claude', 'skills'),
    manifestPath: path.join(rootDir, '.claude', '.agent-hub-managed.json'),
  },
  {
    name: 'codex',
    skillsDir: path.join(rootDir, '.codex', 'skills'),
    manifestPath: path.join(rootDir, '.codex', '.agent-hub-managed.json'),
  },
  {
    name: 'gemini',
    skillsDir: path.join(rootDir, '.gemini', 'skills'),
    manifestPath: path.join(rootDir, '.gemini', '.agent-hub-managed.json'),
  },
];

const codexManifestPath = path.join(generatedDir, 'codex-home-sync.json');
const codexGeneratedConfigPath = path.join(generatedDir, 'codex-mcp-servers.json');

async function main() {
  const [skillNames, mcpConfig] = await Promise.all([loadSkillNames(), loadMcpConfig()]);
  const changes = [];

  for (const target of skillTargets) {
    await syncSkillsForTarget(target, skillNames, changes);
  }

  const claudeServers = filterServersForTarget(mcpConfig.servers, 'claude');
  const geminiServers = filterServersForTarget(mcpConfig.servers, 'gemini');
  const codexServers = filterServersForTarget(mcpConfig.servers, 'codex');

  await writeManagedJson(
    path.join(rootDir, '.mcp.json'),
    {
      mcpServers: Object.fromEntries(claudeServers.map((server) => [server.name, renderClaudeServer(server)])),
    },
    changes
  );

  await syncGeminiSettings(geminiServers, changes);
  await writeManagedJson(codexGeneratedConfigPath, { servers: codexServers }, changes);
  await writeManagedJson(
    codexManifestPath,
    {
      schemaVersion: 1,
      managedServerNames: codexServers.map((server) => server.name).sort(),
    },
    changes
  );

  if (applyCodexHome) {
    const codexChanges = syncCodexHome(codexServers);
    changes.push(...codexChanges);
  }

  if (checkOnly) {
    if (changes.length > 0) {
      console.error('agent-hub drift detected:');
      for (const change of changes) {
        console.error(`- ${change}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('agent-hub is in sync');
    return;
  }

  if (changes.length === 0) {
    console.log('agent-hub already up to date');
    return;
  }

  console.log('agent-hub sync complete:');
  for (const change of changes) {
    console.log(`- ${change}`);
  }
}

async function loadSkillNames() {
  const entries = await readdir(skillsSourceDir, { withFileTypes: true });
  const skillNames = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillFile = path.join(skillsSourceDir, entry.name, 'SKILL.md');
    if (!(await pathExists(skillFile))) {
      throw new Error(`Missing SKILL.md for shared skill "${entry.name}"`);
    }

    skillNames.push(entry.name);
  }

  return skillNames.sort();
}

async function loadMcpConfig() {
  const rawConfig = await readFile(mcpConfigPath, 'utf8');
  return mcpConfigSchema.parse(JSON.parse(rawConfig));
}

async function syncSkillsForTarget(target, skillNames, changes) {
  await mkdir(target.skillsDir, { recursive: true });

  const previousManifest = await readJsonFile(target.manifestPath, managedSkillsSchema, {
    schemaVersion: 1,
    managedSkills: [],
  });

  const staleSkills = previousManifest.managedSkills.filter((skillName) => !skillNames.includes(skillName));

  for (const skillName of staleSkills) {
    const stalePath = path.join(target.skillsDir, skillName);
    if (await pathExists(stalePath)) {
      if (checkOnly) {
        changes.push(`${relativeToRoot(stalePath)} should be removed`);
      } else {
        await rm(stalePath, { recursive: true, force: true });
        changes.push(`removed ${relativeToRoot(stalePath)}`);
      }
    }
  }

  for (const skillName of skillNames) {
    const sourceDir = path.join(skillsSourceDir, skillName);
    const targetDir = path.join(target.skillsDir, skillName);
    await syncDirectory(sourceDir, targetDir, changes);
  }

  await writeManagedJson(
    target.manifestPath,
    {
      schemaVersion: 1,
      managedSkills: skillNames,
    },
    changes
  );
}

async function syncDirectory(sourceDir, targetDir, changes) {
  const matches = await directoriesMatch(sourceDir, targetDir);

  if (checkOnly) {
    if (!matches) {
      changes.push(`${relativeToRoot(targetDir)} is out of sync`);
    }
    return;
  }

  if (matches) {
    return;
  }

  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
  changes.push(`synced ${relativeToRoot(targetDir)}`);
}

async function directoriesMatch(sourceDir, targetDir) {
  if (!(await pathExists(targetDir))) {
    return false;
  }

  const sourceFiles = await collectFiles(sourceDir);
  const targetFiles = await collectFiles(targetDir);

  if (sourceFiles.length !== targetFiles.length) {
    return false;
  }

  for (let index = 0; index < sourceFiles.length; index += 1) {
    if (sourceFiles[index] !== targetFiles[index]) {
      return false;
    }
  }

  for (const relativePath of sourceFiles) {
    const [sourceContent, targetContent] = await Promise.all([
      readFile(path.join(sourceDir, relativePath)),
      readFile(path.join(targetDir, relativePath)),
    ]);

    if (!sourceContent.equals(targetContent)) {
      return false;
    }
  }

  return true;
}

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, relativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function filterServersForTarget(servers, targetName) {
  return servers
    .filter((server) => server.enabled && server.targets[targetName])
    .sort((left, right) => left.name.localeCompare(right.name));
}

function renderClaudeServer(server) {
  if (server.transport.type === 'stdio') {
    return compactObject({
      command: server.transport.command,
      args: server.transport.args,
      env: objectOrUndefined(server.transport.env),
    });
  }

  if (server.transport.type === 'sse') {
    return compactObject({
      type: 'sse',
      url: server.transport.url,
      headers: objectOrUndefined(server.transport.headers),
    });
  }

  return compactObject({
    type: 'http',
    url: server.transport.url,
    headers: objectOrUndefined(server.transport.headers),
  });
}

function renderGeminiServer(server) {
  if (server.transport.type === 'stdio') {
    return compactObject({
      command: server.transport.command,
      args: server.transport.args,
      cwd: server.transport.cwd,
      env: objectOrUndefined(server.transport.env),
    });
  }

  if (server.transport.type === 'sse') {
    return compactObject({
      url: server.transport.url,
      headers: objectOrUndefined(server.transport.headers),
    });
  }

  return compactObject({
    httpUrl: server.transport.url,
    headers: objectOrUndefined(server.transport.headers),
  });
}

async function syncGeminiSettings(servers, changes) {
  const settingsPath = path.join(rootDir, '.gemini', 'settings.json');
  const existingSettings = await readGenericJsonFile(settingsPath, {});
  const nextSettings = {
    ...existingSettings,
    mcpServers: Object.fromEntries(servers.map((server) => [server.name, renderGeminiServer(server)])),
  };

  await writeManagedJson(settingsPath, nextSettings, changes);
}

function syncCodexHome(servers) {
  const changes = [];
  const desiredNames = new Set(servers.map((server) => server.name));
  const previousManifest = readGenericJsonFileSync(codexManifestPath, {
    schemaVersion: 1,
    managedServerNames: [],
  });
  const currentServers = readCodexServerMap();

  for (const staleName of previousManifest.managedServerNames) {
    if (desiredNames.has(staleName)) {
      continue;
    }

    if (currentServers.has(staleName)) {
      if (checkOnly) {
        changes.push(`~/.codex/config.toml should remove MCP server "${staleName}"`);
      } else {
        execFileSync('codex', ['mcp', 'remove', staleName], { stdio: 'ignore' });
        changes.push(`removed Codex MCP "${staleName}" from ~/.codex/config.toml`);
      }
    }
  }

  for (const server of servers) {
    const currentServer = currentServers.get(server.name);
    if (currentServer && codexServerMatches(server, currentServer)) {
      continue;
    }

    if (checkOnly) {
      changes.push(`~/.codex/config.toml should sync MCP server "${server.name}"`);
      continue;
    }

    if (currentServer) {
      execFileSync('codex', ['mcp', 'remove', server.name], { stdio: 'ignore' });
    }

    execFileSync('codex', buildCodexAddArgs(server), { stdio: 'ignore' });
    changes.push(`synced Codex MCP "${server.name}" into ~/.codex/config.toml`);
  }

  return changes;
}

function readCodexServerMap() {
  const parsed = z
    .array(
      z.object({
        name: z.string(),
        transport: z.object({
          type: z.string(),
          command: z.string().nullable().optional(),
          args: z.array(z.string()).nullable().optional(),
          cwd: z.string().nullable().optional(),
          url: z.string().nullable().optional(),
        }),
      })
    )
    .parse(JSON.parse(execFileSync('codex', ['mcp', 'list', '--json'], { encoding: 'utf8' })));

  return new Map(parsed.map((server) => [server.name, server]));
}

function codexServerMatches(server, currentServer) {
  if (server.transport.type === 'stdio') {
    return (
      currentServer.transport.type === 'stdio' &&
      currentServer.transport.command === server.transport.command &&
      JSON.stringify(currentServer.transport.args ?? []) === JSON.stringify(server.transport.args) &&
      (currentServer.transport.cwd ?? null) === (server.transport.cwd ?? null) &&
      Object.keys(server.transport.env).length === 0
    );
  }

  if (server.transport.type === 'http') {
    return currentServer.transport.type === 'http' && currentServer.transport.url === server.transport.url;
  }

  return false;
}

function buildCodexAddArgs(server) {
  if (server.transport.type === 'sse') {
    throw new Error(`Codex MCP sync does not support SSE servers: ${server.name}`);
  }

  if (server.transport.type === 'http') {
    const args = ['mcp', 'add', server.name, '--url', server.transport.url];
    if (server.transport.bearerTokenEnvVar) {
      args.push('--bearer-token-env-var', server.transport.bearerTokenEnvVar);
    }
    return args;
  }

  const args = ['mcp', 'add', server.name];

  for (const [key, value] of Object.entries(server.transport.env)) {
    args.push('--env', `${key}=${value}`);
  }

  args.push('--', server.transport.command, ...server.transport.args);
  return args;
}

async function writeManagedJson(filePath, value, changes) {
  const nextContent = `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;

  if (checkOnly) {
    const currentContent = await readFileIfExists(filePath);
    if (currentContent !== nextContent) {
      changes.push(`${relativeToRoot(filePath)} is out of sync`);
    }
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const currentContent = await readFileIfExists(filePath);

  if (currentContent === nextContent) {
    return;
  }

  await writeFile(filePath, nextContent, 'utf8');
  changes.push(`updated ${relativeToRoot(filePath)}`);
}

async function readJsonFile(filePath, schema, fallbackValue) {
  const currentContent = await readFileIfExists(filePath);
  if (currentContent === null) {
    return fallbackValue;
  }

  return schema.parse(JSON.parse(currentContent));
}

async function readGenericJsonFile(filePath, fallbackValue) {
  const currentContent = await readFileIfExists(filePath);
  if (currentContent === null) {
    return fallbackValue;
  }

  const parsed = JSON.parse(currentContent);
  if (!isPlainObject(parsed)) {
    throw new Error(`${relativeToRoot(filePath)} must contain a JSON object`);
  }

  return parsed;
}

function readGenericJsonFileSync(filePath, fallbackValue) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!isPlainObject(parsed)) {
      throw new Error(`${relativeToRoot(filePath)} must contain a JSON object`);
    }
    return parsed;
  } catch (error) {
    return fallbackValue;
  }
}

async function readFileIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

function relativeToRoot(filePath) {
  if (filePath.startsWith(rootDir)) {
    return path.relative(rootDir, filePath) || '.';
  }
  return filePath;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => {
      if (entryValue === undefined) {
        return false;
      }
      if (Array.isArray(entryValue)) {
        return entryValue.length > 0;
      }
      if (isPlainObject(entryValue)) {
        return Object.keys(entryValue).length > 0;
      }
      return true;
    })
  );
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeysDeep(entry));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeysDeep(value[key])])
  );
}

function objectOrUndefined(value) {
  return value && Object.keys(value).length > 0 ? value : undefined;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFileError(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
