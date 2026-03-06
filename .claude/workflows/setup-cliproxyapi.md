---
description: Setup CLIProxyAPI to use Claude Code subscription with AI coding tools
---

# CLIProxyAPI Setup Workflow

This workflow guides you through setting up CLIProxyAPI to use your Claude Code (or other AI) subscriptions with AI coding tools like Factory Droid, without needing API keys.

## Overview

CLIProxyAPI is a proxy server that provides OpenAI/Gemini/Claude/Codex compatible API interfaces for CLI-based AI services. It allows you to use your existing subscriptions (Claude Code, Codex, Gemini CLI, etc.) with AI coding tools through OAuth authentication.

**Key Benefit**: No API keys needed - uses your existing subscriptions!

## Supported Providers

- **Claude Code** (Anthropic via OAuth)
- **Codex** (OpenAI via OAuth)
- **Gemini CLI** (Google via OAuth)
- **Qwen Code** (via OAuth)
- **iFlow** (via OAuth)
- **Antigravity**
- **AI Studio API Keys**
- **OpenAI-compatible providers**

## Installation Steps

### 1. Install CLIProxyAPI

**Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/brokechubb/cliproxyapi-installer/refs/heads/master/cliproxyapi-installer | bash
```

**macOS:**

```bash
brew install cliproxyapi
brew services start cliproxyapi
```

**Windows:**
Download from: https://github.com/router-for-me/CLIProxyAPI/releases

**Docker:**

```bash
docker run --rm -p 8317:8317 \
  -v /path/to/config.yaml:/CLIProxyAPI/config.yaml \
  -v /path/to/auth-dir:/root/.cli-proxy-api \
  eceasy/cli-proxy-api:latest
```

**Installation creates:**

- Binary: `~/cliproxyapi/cli-proxy-api`
- Config: `~/cliproxyapi/config.yaml`
- Auth directory: `~/.cli-proxy-api/`
- Systemd service: `~/.config/systemd/user/cliproxyapi.service` (Linux)

### 2. Authenticate with Provider(s)

Navigate to the CLIProxyAPI directory and run the appropriate login command:

```bash
cd ~/cliproxyapi

# Claude Code
./cli-proxy-api --claude-login

# Codex (OpenAI)
./cli-proxy-api --codex-login

# Gemini CLI
./cli-proxy-api --login

# Qwen Code
./cli-proxy-api --qwen-login

# iFlow
./cli-proxy-api --iflow-login
```

**Options:**

- Add `--no-browser` to print the login URL instead of opening a browser
- OAuth callbacks use specific ports (Claude: 54545, Codex: 1455, Gemini: 8085, iFlow: 11451)

**Important**: Authentication credentials are saved in `~/.cli-proxy-api/` with filenames like `claude-<email>.json`

### 3. Configure API Keys

**Critical Step**: Add `sk-dummy` (or your preferred placeholder) to the valid API keys list in `config.yaml`:

```yaml
# API keys for authentication
api-keys:
  - 'sk-dummy'
  - 'your-api-key-1'
  - 'your-api-key-2'
```

**Why?** CLIProxyAPI requires authentication for all requests. The documentation uses `sk-dummy` as a standard placeholder, but you must explicitly add it to your config for it to work.

### 4. Start the Service

**Linux (systemd):**

```bash
systemctl --user enable cliproxyapi.service
systemctl --user start cliproxyapi.service
systemctl --user status cliproxyapi.service
```

**macOS (Homebrew):**

```bash
brew services start cliproxyapi
```

**Manual/Docker:**

```bash
./cli-proxy-api --config /path/to/config.yaml
```

**Verify it's running:**

```bash
curl -H "Authorization: Bearer sk-dummy" http://127.0.0.1:8317/v1/models
```

## Configure AI Coding Tools

### Factory Droid Configuration

Edit `~/.factory/config.json`:

```json
{
  "custom_models": [
    {
      "model": "claude-sonnet-4-5-20250929",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "claude-opus-4-5-20251101",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "gemini-2.5-pro",
      "base_url": "http://127.0.0.1:8317/v1",
      "api_key": "sk-dummy",
      "provider": "openai"
    },
    {
      "model": "gpt-5",
      "base_url": "http://127.0.0.1:8317/v1",
      "api_key": "sk-dummy",
      "provider": "openai"
    }
  ]
}
```

**Key Configuration Rules:**

- **Claude models**:
  - `base_url`: `http://127.0.0.1:8317` (no `/v1`)
  - `provider`: `"anthropic"`
- **OpenAI/Gemini models**:
  - `base_url`: `http://127.0.0.1:8317/v1` (with `/v1`)
  - `provider`: `"openai"`

- **API Key**: Always use `"sk-dummy"` (must match your config.yaml)

### Other AI Tools

Similar configuration patterns apply to:

- Claude Code CLI
- Cursor
- Cline
- Roo Code
- Amp CLI
- Continue
- Other OpenAI-compatible tools

See: https://help.router-for.me/agent-client/

## Available Claude Models (via Claude Code OAuth)

After authenticating, these models are typically available:

- `claude-3-7-sonnet-20250219` - Claude 3.7 Sonnet
- `claude-3-5-haiku-20241022` - Claude 3.5 Haiku
- `claude-haiku-4-5-20251001` - Claude 4.5 Haiku
- `claude-sonnet-4-5-20250929` - Claude 4.5 Sonnet
- `claude-opus-4-5-20251101` - Claude 4.5 Opus (Latest!)
- `claude-opus-4-1-20250805` - Claude 4.1 Opus
- `claude-opus-4-20250514` - Claude 4 Opus
- `claude-sonnet-4-20250514` - Claude 4 Sonnet

**Check available models:**

```bash
curl -H "Authorization: Bearer sk-dummy" http://127.0.0.1:8317/v1/models | jq '.data[] | .id'
```

## Useful Commands

### Service Management (Linux)

```bash
# Status
systemctl --user status cliproxyapi.service

# Logs (live)
journalctl --user -u cliproxyapi.service -f

# Logs (recent)
journalctl --user -u cliproxyapi.service -n 50 --no-pager

# Restart
systemctl --user restart cliproxyapi.service

# Stop
systemctl --user stop cliproxyapi.service
```

### Configuration Files

- **CLIProxyAPI Config**: `~/cliproxyapi/config.yaml`
- **Auth Tokens**: `~/.cli-proxy-api/`
- **Droid Config**: `~/.factory/config.json`

### Testing Endpoints

**Claude API (native format):**

```bash
curl -H "x-api-key: sk-dummy" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-5-20251101","messages":[{"role":"user","content":"Hello"}],"max_tokens":100}' \
  http://127.0.0.1:8317/v1/messages
```

**OpenAI-compatible format:**

```bash
curl -H "Authorization: Bearer sk-dummy" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-5-20251101","messages":[{"role":"user","content":"Hello"}],"max_tokens":100}' \
  http://127.0.0.1:8317/v1/chat/completions
```

## Troubleshooting

### 401 "Invalid API key" Error

**Cause**: `sk-dummy` (or your API key) is not in the `api-keys` list in `config.yaml`

**Fix**:

1. Edit `~/cliproxyapi/config.yaml`
2. Add `sk-dummy` to the `api-keys` array
3. Restart: `systemctl --user restart cliproxyapi.service`

### Models Not Showing Up

**Cause**: CLIProxyAPI not authenticated with the provider

**Fix**:

1. Run the appropriate login command (e.g., `./cli-proxy-api --claude-login`)
2. Check auth files exist: `ls ~/.cli-proxy-api/`
3. Check logs: `journalctl --user -u cliproxyapi.service -n 50`

### Service Won't Start

**Check logs:**

```bash
journalctl --user -u cliproxyapi.service --no-pager -n 50
```

**Common issues:**

- Port 8317 already in use
- Config file syntax error
- Missing auth directory

### Debug Mode

Enable detailed logging in `config.yaml`:

```yaml
debug: true
```

Then restart the service and check logs.

## Advanced Configuration

### Multi-Account Load Balancing

CLIProxyAPI supports multiple accounts for the same provider with round-robin load balancing:

1. Run login command multiple times with different accounts
2. Each creates a separate auth file in `~/.cli-proxy-api/`
3. Requests are automatically distributed across accounts

### Custom API Keys

Instead of `sk-dummy`, use generated keys from installation:

```yaml
api-keys:
  - 'sk-7l88UFPlZSe1qMUitleZlks5Be2EYEwg4dTcHHoVLkVGs'
  - 'sk-6VGGZx7cgP8oxO8QsMfAQngHSSwNqn8lxJBciGqm5OmJ5'
```

### Proxy Configuration

If behind a corporate proxy:

```yaml
proxy-url: 'socks5://user:pass@proxy.example.com:1080'
```

### Model Aliases

Rename models for easier access:

```yaml
oauth-model-alias:
  claude:
    - name: 'claude-sonnet-4-5-20250929'
      alias: 'sonnet'
```

## Resources

- **Documentation**: https://help.router-for.me/
- **GitHub**: https://github.com/router-for-me/CLIProxyAPI
- **Droid Config Guide**: https://help.router-for.me/agent-client/droid.html
- **Provider Setup Guides**: https://help.router-for.me/configuration/provider/

## Security Notes

- Auth tokens stored in `~/.cli-proxy-api/` contain OAuth credentials
- API keys in `config.yaml` control access to the proxy
- Default setup binds to `0.0.0.0` (all interfaces) - use `host: "127.0.0.1"` for localhost-only
- Use different API keys for different clients/users
- Regularly refresh OAuth tokens (CLIProxyAPI auto-refreshes every 15 minutes)

## Migration & Backup

**Backup auth tokens:**

```bash
cp -r ~/.cli-proxy-api ~/.cli-proxy-api.backup
```

**Backup config:**

```bash
cp ~/cliproxyapi/config.yaml ~/cliproxyapi/config.yaml.backup
```

**Restore on new machine:**

```bash
# Install CLIProxyAPI
# Then restore:
cp -r ~/.cli-proxy-api.backup ~/.cli-proxy-api
cp ~/cliproxyapi/config.yaml.backup ~/cliproxyapi/config.yaml
systemctl --user restart cliproxyapi.service
```
