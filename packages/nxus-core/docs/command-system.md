# Command System Architecture

This document describes the command execution system in Nxus, including the command palette, terminal panel, and command types.

## Overview

Nxus provides a unified command system that allows:

- Executing commands from app manifests
- Running generic system commands
- Viewing command output in a floating terminal panel

## Command Palette

**Shortcut**: `Ctrl+Shift+P`

The command palette provides quick access to all commands across the application.

### Two-Step Flows

Some commands require target selection:

1. **Generic commands** (e.g., "Generate Thumbnail") prompt for an app
2. **Instance commands** would prompt for an instance (TODO)

### Command Sources

| Source           | Description                                   |
| ---------------- | --------------------------------------------- |
| App Commands     | From `manifest.json` `commands` array         |
| Generic Commands | System-level actions defined in `registry.ts` |

## Command Types

### App-Bound Commands (from manifests)

Defined in each app's `manifest.json`:

```json
{
  "commands": [
    {
      "id": "install-claude-code",
      "name": "Install",
      "icon": "Download",
      "category": "Setup",
      "target": "app",
      "mode": "execute",
      "command": "npm install -g @anthropic-ai/claude-code"
    }
  ]
}
```

#### Command Modes

| Mode        | Behavior                                                            |
| ----------- | ------------------------------------------------------------------- |
| `execute`   | Run shell command → output to terminal panel                        |
| `copy`      | Copy command string to clipboard                                    |
| `docs`      | Open URL in new tab                                                 |
| `terminal`  | Navigate to app page with action param (TODO: open system terminal) |
| `configure` | Navigate to `/apps/{appId}?action={commandId}`                      |

#### Command Targets

| Target     | Scope                                                       |
| ---------- | ----------------------------------------------------------- |
| `app`      | App-level command (shown in App Actions panel)              |
| `instance` | Instance-specific command (shown in Instance Actions panel) |

### Generic Commands (system-level)

Defined in `services/command-palette/registry.ts`:

```typescript
const genericCommands = [
  { id: 'generate-thumbnail', name: 'Generate Thumbnail', needsTarget: 'app' },
  { id: 'open-folder', name: 'Open in File Explorer', needsTarget: 'instance' },
  { id: 'open-terminal', name: 'Open Terminal Here', needsTarget: 'instance' },
]
```

These require selecting a target before execution.

## Terminal Panel

A floating panel at the bottom of the screen that displays command output.

### Features

- **Tabbed interface**: Multiple concurrent commands
- **Minimize/maximize**: Collapse to tab bar only
- **Status indicators**: ● running, ✓ success, ✗ error
- **Auto-scroll**: Follows output, pauses when user scrolls up
- **Copy logs**: Copy all output to clipboard

### State Management

Uses Zustand store (`stores/terminal.store.ts`) with:

```typescript
interface TerminalTab {
  id: string
  label: string
  logs: LogEntry[]
  status: 'running' | 'success' | 'error' | 'idle'
}
```

## File Structure

```
src/
├── components/
│   ├── command-palette.tsx      # Main palette UI
│   └── terminal-panel.tsx       # Floating terminal
├── stores/
│   ├── command-palette.store.ts # Palette open/close state
│   └── terminal.store.ts        # Terminal tabs & logs
└── services/
    └── command-palette/
        └── registry.ts          # Command collection & routing
```

## URL-Based Actions

Commands that require UI (modals, forms) navigate via URL params:

```
/apps/claude-code-glm?action=configure
```

The app detail page reads `?action=` and handles appropriately:

- `configure` → Opens config modal
- `generate-thumbnail` → Triggers thumbnail generation
- `open-folder` → Opens file explorer (TODO)

This keeps the command palette stateless.

## Adding New Commands

### App Command

Add to the app's `manifest.json`:

```json
{
  "id": "my-command",
  "name": "My Command",
  "description": "Does something",
  "icon": "Gear",
  "category": "Actions",
  "target": "app",
  "mode": "execute",
  "command": "echo 'Hello World'"
}
```

### Generic Command

Add to `services/command-palette/registry.ts`:

```typescript
{
  id: 'my-generic-command',
  name: 'My Generic Command',
  icon: 'Star',
  needsTarget: 'app',
  execute: (appId) => {
    // Handle execution
  },
}
```

## Future Considerations

1. **Instance target selection** for generic commands
2. **Command history** / recent commands
3. **Keyboard navigation** in palette results
4. **Command aliases** / fuzzy search improvements
