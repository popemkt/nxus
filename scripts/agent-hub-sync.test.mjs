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

function runSync(workspaceDir, extraArgs = []) {
  execFileSync('node', [syncScriptPath, ...extraArgs], {
    cwd: workspaceDir,
    stdio: 'pipe',
  });
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
