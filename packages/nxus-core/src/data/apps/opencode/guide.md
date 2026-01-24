# OpenCode User Guide

OpenCode is an open-source AI coding agent with a Terminal User Interface (TUI). It helps developers write code directly in their terminal by providing intelligent AI assistance.

## Quick Start

### 1. Install OpenCode

{{command:install-opencode}}

Or manually install using one of the following:

**Linux/macOS:**
```bash
curl -fsSL https://opencode.ai/install | bash
```

**macOS (Homebrew):**
```bash
brew install opencode-ai/tap/opencode
```

**Windows:**
```bash
winget install opencode
```

### 2. Configure API Keys

OpenCode requires API keys from AI providers. Choose one of the following methods:

**Method A: Interactive Auth**
{{command:opencode-auth-login}}

**Method B: Environment Variables**
```bash
export ANTHROPIC_API_KEY="your-key-here"
# or
export OPENAI_API_KEY="your-key-here"
# or
export GEMINI_API_KEY="your-key-here"
```

**Method C: Config File**

{{command:opencode-config}}

Or manually edit `~/.opencode.json`:

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "your-key",
      "disabled": false
    }
  }
}
```

### 3. Start Using OpenCode

{{command:opencode-start}}

## Core Commands

| Command | Description |
|---------|-------------|
| {{command:opencode-start}} | Launch the Terminal UI (TUI) |
| {{command:opencode-run}} | Run a single prompt (non-interactive) |
| {{command:opencode-continue}} | Continue the last session |
| {{command:opencode-auth-login}} | Authenticate with an AI provider |
| {{command:opencode-models}} | List available models |
| {{command:opencode-stats}} | View usage statistics |

## Session Management

{{command:opencode-session-list}}

```bash
# Export a session
opencode export <session-id>

# Import a session
opencode import <file-or-url>
```

## Custom Agents

{{command:opencode-agent-create}}

This opens an interactive prompt to define:
- Agent name
- System prompt
- Default model
- Temperature settings

## Configuration File Locations

OpenCode looks for configuration in this order:

1. `$XDG_CONFIG_HOME/opencode/.opencode.json`
2. `~/.opencode.json`
3. `./.opencode.json` (project-specific, current directory)

## Supported AI Providers

OpenCode supports 75+ providers through Models.dev:

- **Anthropic**: Claude Sonnet, Opus, Haiku
- **OpenAI**: GPT-4, GPT-4o, O1, O3
- **Google**: Gemini 2.0, 2.5 Flash, Pro
- **GitHub**: Copilot
- **AWS**: Bedrock
- **Azure**: OpenAI
- **Groq**, **OpenRouter**, and many more

## Tips & Tricks

1. **Use Continue**: When you close OpenCode, your session is saved. Use `opencode tui --continue` to pick up where you left off.

2. **Non-Interactive Mode**: Use `opencode run "your prompt"` for quick tasks without entering the TUI.

3. **Project-Specific Config**: Create a `.opencode.json` in your project directory for repo-specific settings.

4. **Model Selection**: Set a default model in your config or use `opencode models <provider>` to see available options.

## Important Note

> **OpenCode has been archived!** The original project at [opencode-ai/opencode](https://github.com/opencode-ai/opencode) has been archived by the author. The project continues under the name **"Crush"** by the Charm team.

You may still use OpenCode, but consider migrating to Crush for future updates and support.

## Links

- [Official Website](https://opencode.ai)
- [Documentation](https://opencode.ai/docs/)
- [GitHub Repository](https://github.com/opencode-ai/opencode)
