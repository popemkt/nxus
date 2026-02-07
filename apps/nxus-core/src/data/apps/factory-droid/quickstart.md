# Factory Droid Quick Start

Factory Droid is an AI agentic coding assistant for agent-native software development.

## Installation

{{command:install-factory-droid}}

**Manual Installation (Linux/macOS):**

```bash
curl -fsSL https://app.factory.ai/cli | sh
```

**Windows (PowerShell):**

```powershell
irm https://app.factory.ai/cli/windows | iex
```

## Getting Started

1. Navigate to your project directory
2. Start an interactive session:

{{command:start-droid}}

Or manually:

```bash
droid
```

## Example Prompts

- Analyze codebase: `> analyze this codebase and explain the architecture`
- Make changes: `> add logging to the main startup`
- Security audit: `> audit for security vulnerabilities`
- Git workflow: `> review my changes and create a commit`

## Essential Controls

| Key      | Action                   |
| -------- | ------------------------ |
| `exit`   | End session              |
| `Ctrl+C` | Cancel current operation |

## Links

- [Documentation](https://docs.factory.ai)
- [CLI Overview](https://docs.factory.ai/cli/getting-started/overview)
- [GitHub](https://github.com/Factory-AI/factory)
