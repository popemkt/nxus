# CLIProxyAPI Setup Guide

CLIProxyAPI is a proxy server that lets you use your Claude Code, Codex, Gemini CLI, and other AI subscriptions with AI coding tools - without needing API keys!

## Quick Start

### 1. Install CLIProxyAPI

Use the install command to automatically detect your platform and install:

{{command:install-cliproxyapi}}

### 2. Configure API Keys

**Important**: You must add `sk-dummy` to the valid API keys list in your config file.

Edit `~/cliproxyapi/config.yaml` and add:

```yaml
api-keys:
  - 'sk-dummy'
  - 'your-api-key-1' # Optional: add more keys
```

{{command:edit-config}}

### 3. Authenticate with Providers

Choose which AI service(s) you want to use:

#### Claude Code

{{command:login-claude}}

#### OpenAI Codex

{{command:login-codex}}

#### Google Gemini CLI

{{command:login-gemini}}

#### Qwen Code

{{command:login-qwen}}

#### iFlow

{{command:login-iflow}}

### 4. Start the Service

#### Linux

{{command:start-service}}

Check status:
{{command:status-service}}

View logs:
{{command:view-logs}}

#### macOS

{{command:start-service-mac}}

### 5. Verify Installation

List available models from all your authenticated providers:

{{command:list-models}}

Test the Claude API:

{{command:test-claude}}

## Integrate with AI Tools

### Factory Droid

Automatically configure Factory Droid to use your Claude models:

{{command:configure-droid}}

Or manually edit `~/.factory/config.json`:

```json
{
  "custom_models": [
    {
      "model": "claude-opus-4-5-20251101",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-dummy",
      "provider": "anthropic"
    }
  ]
}
```

**Important Configuration Rules:**

- **Claude models**:
  - `base_url`: `"http://127.0.0.1:8317"` (no `/v1`)
  - `provider`: `"anthropic"`
- **OpenAI/Gemini models**:
  - `base_url`: `"http://127.0.0.1:8317/v1"` (with `/v1`)
  - `provider`: `"openai"`

### Other AI Coding Tools

CLIProxyAPI works with any tool that supports OpenAI-compatible APIs:

- Claude Code CLI
- Cursor
- Cline
- Roo Code
- Continue
- Amp CLI
- And more!

Configure them to use:

- Base URL: `http://127.0.0.1:8317/v1` (OpenAI format) or `http://127.0.0.1:8317` (Claude format)
- API Key: `sk-dummy`

## Available Models

After authenticating with Claude Code, you'll have access to:

- `claude-opus-4-5-20251101` - Claude 4.5 Opus (Latest!)
- `claude-sonnet-4-5-20250929` - Claude 4.5 Sonnet
- `claude-opus-4-1-20250805` - Claude 4.1 Opus
- `claude-sonnet-4-20250514` - Claude 4 Sonnet
- `claude-haiku-4-5-20251001` - Claude 4.5 Haiku
- `claude-3-7-sonnet-20250219` - Claude 3.7 Sonnet
- `claude-3-5-haiku-20241022` - Claude 3.5 Haiku

Similar model sets are available for Codex, Gemini, Qwen, and iFlow after authentication.

## Service Management

### Linux (systemd)

Start service:
{{command:start-service}}

Stop service:
{{command:stop-service}}

Restart service:
{{command:restart-service}}

Check status:
{{command:status-service}}

View logs:
{{command:view-logs}}

### macOS (Homebrew)

```bash
brew services start cliproxyapi
brew services stop cliproxyapi
brew services restart cliproxyapi
```

## Configuration

### View Authentication Files

See which providers you've authenticated with:

{{command:view-auth-files}}

### Edit Configuration

{{command:edit-config}}

Key configuration options:

```yaml
# Server settings
host: '' # Empty = bind all interfaces, "127.0.0.1" = localhost only
port: 8317 # Default port

# API keys for authentication
api-keys:
  - 'sk-dummy' # Must include this!
  - 'custom-key'

# Enable debug logging
debug: false

# Proxy settings (if behind corporate proxy)
proxy-url: 'socks5://user:pass@proxy.example.com:1080'

# Multi-account load balancing strategy
routing:
  strategy: 'round-robin' # or "fill-first"
```

## Troubleshooting

### 401 "Invalid API key" Error

**Solution**: Add `sk-dummy` to the `api-keys` list in `config.yaml`:

```yaml
api-keys:
  - 'sk-dummy'
```

Then restart:
{{command:restart-service}}

### Models Not Showing

**Solution**: Authenticate with the provider first:

- Claude: {{command:login-claude}}
- Codex: {{command:login-codex}}
- Gemini: {{command:login-gemini}}

Then check auth files:
{{command:view-auth-files}}

### Service Won't Start

Check logs for errors:
{{command:view-logs}}

Common issues:

- Port 8317 already in use
- Config file syntax error
- Missing auth directory

### Enable Debug Mode

Edit config:

```yaml
debug: true
```

Restart service and check logs for detailed information.

## Advanced Features

### Multi-Account Load Balancing

Run the login command multiple times with different accounts to enable automatic load balancing across accounts.

### Model Aliases

Rename models for easier access in `config.yaml`:

```yaml
oauth-model-alias:
  claude:
    - name: 'claude-sonnet-4-5-20250929'
      alias: 'sonnet'
```

### Custom Upstream Providers

Use OpenAI-compatible providers:

```yaml
openai-compatibility:
  - name: 'openrouter'
    base-url: 'https://openrouter.ai/api/v1'
    api-key-entries:
      - api-key: 'sk-or-v1-...'
    models:
      - name: 'anthropic/claude-3-opus'
        alias: 'claude-opus'
```

## Resources

- **Full Documentation**: {{command:open-docs}}
- **GitHub Repository**: {{command:open-github}}
- **Factory Droid Config Guide**: See "Factory Droid Configuration" doc
- **Community Support**: GitHub Issues

## Security Notes

- Auth tokens are stored in `~/.cli-proxy-api/` and contain OAuth credentials
- API keys in `config.yaml` control access to the proxy
- Default setup binds to all interfaces - use `host: "127.0.0.1"` for localhost-only access
- Auto-refresh for OAuth tokens runs every 15 minutes

## Backup & Migration

### Backup Your Setup

```bash
# Backup auth tokens
cp -r ~/.cli-proxy-api ~/.cli-proxy-api.backup

# Backup config
cp ~/cliproxyapi/config.yaml ~/cliproxyapi/config.yaml.backup
```

### Restore on New Machine

1. Install CLIProxyAPI: {{command:install-cliproxyapi}}
2. Restore files:
   ```bash
   cp -r ~/.cli-proxy-api.backup ~/.cli-proxy-api
   cp ~/cliproxyapi/config.yaml.backup ~/cliproxyapi/config.yaml
   ```
3. Start service: {{command:start-service}}

---

**Need help?** Check the {{command:open-docs}} or open an issue on {{command:open-github}}
