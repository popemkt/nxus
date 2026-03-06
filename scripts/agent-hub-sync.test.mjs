import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const syncScriptPath = path.join(__dirname, 'agent-hub-sync.mjs');

async function createWorkspace() {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), 'agent-hub-sync-'));

  await mkdir(path.join(workspaceDir, 'agent-hub', 'skills', 'shared-skill'), {
    recursive: true,
  });
  await mkdir(path.join(workspaceDir, 'agent-hub', 'mcp'), {
    recursive: true,
  });
  await mkdir(path.join(workspaceDir, '.claude', 'skills', 'manual-skill'), {
    recursive: true,
  });
  await mkdir(path.join(workspaceDir, '.codex', 'skills'), {
    recursive: true,
  });
  await mkdir(path.join(workspaceDir, '.gemini', 'skills'), {
    recursive: true,
  });

  await writeFile(
    path.join(workspaceDir, 'agent-hub', 'skills', 'shared-skill', 'SKILL.md'),
    '# Shared Skill\n',
    'utf8',
  );
  await writeFile(
    path.join(workspaceDir, 'agent-hub', 'mcp', 'servers.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        servers: [
          {
            name: 'playwright',
            enabled: true,
            targets: { claude: true, codex: true, gemini: true },
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@playwright/mcp@latest'],
              env: {},
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(
    path.join(workspaceDir, '.claude', 'skills', 'manual-skill', 'SKILL.md'),
    '# Manual Skill\n',
    'utf8',
  );
  await writeFile(
    path.join(workspaceDir, '.claude', '.agent-hub-managed.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        managedSkills: ['stale-skill'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await mkdir(path.join(workspaceDir, '.claude', 'skills', 'stale-skill'), {
    recursive: true,
  });
  await writeFile(
    path.join(workspaceDir, '.claude', 'skills', 'stale-skill', 'SKILL.md'),
    '# Stale Skill\n',
    'utf8',
  );
  await writeFile(
    path.join(workspaceDir, '.gemini', 'settings.json'),
    `${JSON.stringify(
      {
        theme: 'light',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return workspaceDir;
}

function runSync(workspaceDir, extraArgs = [], env = {}) {
  execFileSync('node', [syncScriptPath, ...extraArgs], {
    cwd: workspaceDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function installFakeCodex(workspaceDir, state) {
  const binDir = path.join(workspaceDir, 'bin');
  const statePath = path.join(workspaceDir, 'fake-codex-state.json');
  const logPath = path.join(workspaceDir, 'fake-codex-log.json');
  const scriptPath = path.join(binDir, 'codex');

  await mkdir(binDir, { recursive: true });
  await writeFile(`${statePath}`, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await writeFile(logPath, '[]\n', 'utf8');
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs');

const statePath = ${JSON.stringify(statePath)};
const logPath = ${JSON.stringify(logPath)};
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));

function save() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\\n');
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + '\\n');
}

if (args[0] !== 'mcp') {
  process.exit(1);
}

if (args[1] === 'list' && args[2] === '--json') {
  process.stdout.write(JSON.stringify(state.servers));
  process.exit(0);
}

if (args[1] === 'remove') {
  const name = args[2];
  log.push({ op: 'remove', name });
  state.servers = state.servers.filter((server) => server.name !== name);
  save();
  process.exit(0);
}

if (args[1] === 'add') {
  const name = args[2];
  const urlIndex = args.indexOf('--url');
  const separatorIndex = args.indexOf('--');
  const envVars = [];

  for (let index = 3; index < args.length; index += 2) {
    if (args[index] !== '--env') {
      continue;
    }
    envVars.push(args[index + 1].split('=')[0]);
  }

  let transport;
  if (urlIndex !== -1) {
    transport = {
      type: 'http',
      url: args[urlIndex + 1],
    };
  } else {
    const commandArgs = args.slice(separatorIndex + 1);
    transport = {
      type: 'stdio',
      command: commandArgs[0],
      args: commandArgs.slice(1),
      cwd: null,
      env_vars: envVars,
    };
  }

  log.push({ op: 'add', name, transport });
  state.servers = state.servers.filter((server) => server.name !== name);
  state.servers.push({ name, transport });
  save();
  process.exit(0);
}

process.exit(1);
`,
    { mode: 0o755 },
  );

  return {
    logPath,
    statePath,
    pathEnv: `${binDir}:${process.env.PATH ?? ''}`,
  };
}

test('sync copies managed skills, preserves manual skills, and removes stale managed skills', async () => {
  const workspaceDir = await createWorkspace();

  try {
    runSync(workspaceDir);

    const [sharedSkill, manualSkill, staleSkillExists, manifestRaw] =
      await Promise.all([
        readFile(
          path.join(workspaceDir, '.claude', 'skills', 'shared-skill', 'SKILL.md'),
          'utf8',
        ),
        readFile(
          path.join(workspaceDir, '.claude', 'skills', 'manual-skill', 'SKILL.md'),
          'utf8',
        ),
        readFile(
          path.join(workspaceDir, '.claude', 'skills', 'stale-skill', 'SKILL.md'),
          'utf8',
        ).then(
          () => true,
          () => false,
        ),
        readFile(
          path.join(workspaceDir, '.claude', '.agent-hub-managed.json'),
          'utf8',
        ),
      ]);

    assert.equal(sharedSkill, '# Shared Skill\n');
    assert.equal(manualSkill, '# Manual Skill\n');
    assert.equal(staleSkillExists, false);
    assert.deepEqual(JSON.parse(manifestRaw), {
      schemaVersion: 1,
      managedSkills: ['shared-skill'],
    });
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test('sync renders Claude and Gemini MCP config from central servers.json', async () => {
  const workspaceDir = await createWorkspace();

  try {
    runSync(workspaceDir);

    const [claudeMcpRaw, geminiSettingsRaw, codexGeneratedRaw] = await Promise.all([
      readFile(path.join(workspaceDir, '.mcp.json'), 'utf8'),
      readFile(path.join(workspaceDir, '.gemini', 'settings.json'), 'utf8'),
      readFile(
        path.join(workspaceDir, 'agent-hub', 'generated', 'codex-mcp-servers.json'),
        'utf8',
      ),
    ]);

    assert.deepEqual(JSON.parse(claudeMcpRaw), {
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['@playwright/mcp@latest'],
        },
      },
    });
    assert.deepEqual(JSON.parse(geminiSettingsRaw), {
      theme: 'light',
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['@playwright/mcp@latest'],
        },
      },
    });
    assert.deepEqual(JSON.parse(codexGeneratedRaw), {
      servers: [
        {
          name: 'playwright',
          enabled: true,
          targets: {
            claude: true,
            codex: true,
            gemini: true,
          },
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['@playwright/mcp@latest'],
            env: {},
          },
        },
      ],
    });
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test('apply-codex-home removes stale managed servers using the previous manifest state', async () => {
  const workspaceDir = await createWorkspace();

  try {
    await writeFile(
      path.join(workspaceDir, 'agent-hub', 'mcp', 'servers.json'),
      `${JSON.stringify({ schemaVersion: 1, servers: [] }, null, 2)}\n`,
      'utf8',
    );
    await mkdir(path.join(workspaceDir, 'agent-hub', 'generated'), { recursive: true });
    await writeFile(
      path.join(workspaceDir, 'agent-hub', 'generated', 'codex-home-sync.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          managedServerNames: ['stale-server'],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const fakeCodex = await installFakeCodex(workspaceDir, {
      servers: [
        {
          name: 'stale-server',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['old-server'],
            cwd: null,
            env_vars: [],
          },
        },
      ],
    });

    runSync(workspaceDir, ['--apply-codex-home'], { PATH: fakeCodex.pathEnv });

    const [logRaw, manifestRaw] = await Promise.all([
      readFile(fakeCodex.logPath, 'utf8'),
      readFile(path.join(workspaceDir, 'agent-hub', 'generated', 'codex-home-sync.json'), 'utf8'),
    ]);

    assert.deepEqual(JSON.parse(logRaw), [{ op: 'remove', name: 'stale-server' }]);
    assert.deepEqual(JSON.parse(manifestRaw), {
      schemaVersion: 1,
      managedServerNames: [],
    });
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test('apply-codex-home does not churn stdio servers when env vars are not exposed by codex list', async () => {
  const workspaceDir = await createWorkspace();

  try {
    await writeFile(
      path.join(workspaceDir, 'agent-hub', 'mcp', 'servers.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          servers: [
            {
              name: 'env-server',
              enabled: true,
              targets: { claude: false, codex: true, gemini: false },
              transport: {
                type: 'stdio',
                command: 'npx',
                args: ['env-server'],
                env: { API_TOKEN: 'secret' },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await mkdir(path.join(workspaceDir, 'agent-hub', 'generated'), { recursive: true });
    await writeFile(
      path.join(workspaceDir, 'agent-hub', 'generated', 'codex-home-sync.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          managedServerNames: ['env-server'],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const fakeCodex = await installFakeCodex(workspaceDir, {
      servers: [
        {
          name: 'env-server',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['env-server'],
            cwd: null,
          },
        },
      ],
    });

    runSync(workspaceDir, ['--apply-codex-home'], { PATH: fakeCodex.pathEnv });

    const logRaw = await readFile(fakeCodex.logPath, 'utf8');
    assert.deepEqual(JSON.parse(logRaw), []);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
