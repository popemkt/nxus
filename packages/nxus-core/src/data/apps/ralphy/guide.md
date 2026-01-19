# Ralphy User Guide

> Autonomous AI coding loop. Runs AI agents on tasks until done.

Ralphy is a bash script that orchestrates multiple AI coding agents (Claude Code, Codex, OpenCode, Cursor, Qwen & Droid) to work through your tasks autonomously.

## Quick Start

### Single Task Mode

Run Ralphy with a direct task:

```bash
./ralphy.sh "add login button"
./ralphy.sh "fix the auth bug"
```

### PRD Mode

Work through a task list:

```bash
./ralphy.sh              # uses PRD.md by default
./ralphy.sh --prd tasks.md
```

## Project Configuration

Initialize project settings (auto-detects framework, language, etc.):

```bash
./ralphy.sh --init
./ralphy.sh --config        # view current config
./ralphy.sh --add-rule "use TypeScript strict mode"
```

This creates `.ralphy/config.yaml`:

```yaml
project:
  name: 'my-app'
  language: 'TypeScript'
  framework: 'Next.js'

commands:
  test: 'npm test'
  lint: 'npm run lint'
  build: 'npm run build'

rules:
  - 'use server actions not API routes'
  - 'follow error pattern in src/utils/errors.ts'

boundaries:
  never_touch:
    - 'src/legacy/**'
    - '*.lock'
```

## AI Engines

Ralphy supports multiple AI backends:

| Flag         | Engine        |
| ------------ | ------------- |
| (default)    | Claude Code   |
| `--opencode` | OpenCode      |
| `--cursor`   | Cursor        |
| `--codex`    | Codex         |
| `--qwen`     | Qwen-Code     |
| `--droid`    | Factory Droid |

Example:

```bash
./ralphy.sh --opencode "add dark mode"
./ralphy.sh --droid --prd PRD.md
```

## Task Sources

### Markdown (default)

```markdown
## Tasks

- [ ] create auth
- [ ] add dashboard
- [x] done task (skipped)
```

### YAML

```bash
./ralphy.sh --yaml tasks.yaml
```

### GitHub Issues

```bash
./ralphy.sh --github owner/repo
./ralphy.sh --github owner/repo --github-label "ready"
```

## Parallel Execution

Run multiple agents simultaneously:

```bash
./ralphy.sh --parallel              # 3 agents default
./ralphy.sh --parallel --max-parallel 5
```

Each agent gets an isolated worktree + branch:

```
Agent 1 → /tmp/xxx/agent-1 → ralphy/agent-1-create-auth
Agent 2 → /tmp/xxx/agent-2 → ralphy/agent-2-add-dashboard
Agent 3 → /tmp/xxx/agent-3 → ralphy/agent-3-build-api
```

## Branch Workflow

Create PRs automatically:

```bash
./ralphy.sh --branch-per-task              # branch per task
./ralphy.sh --branch-per-task --create-pr  # + create PRs
./ralphy.sh --branch-per-task --draft-pr   # + draft PRs
./ralphy.sh --base-branch main             # branch from main
```

## All Options

| Option               | Description                   |
| -------------------- | ----------------------------- |
| `--prd FILE`         | Use markdown task file        |
| `--yaml FILE`        | Use YAML task file            |
| `--github REPO`      | Pull tasks from GitHub issues |
| `--github-label TAG` | Filter GitHub issues by label |
| `--parallel`         | Run agents in parallel        |
| `--max-parallel N`   | Max parallel agents           |
| `--branch-per-task`  | Create branch per task        |
| `--base-branch NAME` | Base branch to use            |
| `--create-pr`        | Create PRs for branches       |
| `--draft-pr`         | Create draft PRs              |
| `--no-tests`         | Skip running tests            |
| `--no-lint`          | Skip linting                  |
| `--fast`             | Skip tests and linting        |
| `--no-commit`        | Don't auto-commit             |
| `--max-iterations N` | Max loop iterations           |
| `--max-retries N`    | Max retries on failure        |
| `--retry-delay N`    | Delay between retries         |
| `--dry-run`          | Preview without executing     |
| `-v, --verbose`      | Verbose output                |
| `--init`             | Initialize project config     |
| `--config`           | View current config           |
| `--add-rule "rule"`  | Add a project rule            |

## Requirements

**Required:**

- One AI CLI: {{command:claude-code:install-claude-code}} or {{command:opencode:install-opencode}} or {{command:factory-droid:install-factory-droid}}
- `jq` (JSON processor)

**Optional:**

- `yq` - for YAML tasks
- `gh` - for GitHub issues / `--create-pr`
- `bc` - for cost calculations

## Resources

- [GitHub Repository](https://github.com/michaelshimeles/ralphy)
- [Releases](https://github.com/michaelshimeles/ralphy/releases)
