# Factory Droid Configuration for CLIProxyAPI

This guide shows you how to configure Factory Droid to use your Claude Code subscription through CLIProxyAPI.

## Prerequisites

1. CLIProxyAPI is installed and running
2. You've authenticated with Claude Code: {{command:login-claude}}
3. The service is running: {{command:status-service}}

## Automatic Configuration

The easiest way is to use the auto-configuration script:

{{command:configure-droid}}

This will:

- Add all Claude models from CLIProxyAPI to Droid
- Create a backup of your existing config
- Use the correct endpoint and provider settings

### Options

Add Gemini models too:

```bash
./configure-droid.ps1 -IncludeGemini
```

Add Codex/GPT models:

```bash
./configure-droid.ps1 -IncludeCodex
```

Use a custom API key:

```bash
./configure-droid.ps1 -ApiKey "your-custom-key"
```

## Manual Configuration

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
      "model": "claude-opus-4-1-20250805",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "claude-sonnet-4-20250514",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-dummy",
      "provider": "anthropic"
    }
  ]
}
```

### Configuration Rules

**For Claude Models:**

- `base_url`: `"http://127.0.0.1:8317"` (NO `/v1` suffix!)
- `api_key`: `"sk-dummy"` (must match your CLIProxyAPI config)
- `provider`: `"anthropic"`

**For Gemini/GPT Models:**

- `base_url`: `"http://127.0.0.1:8317/v1"` (WITH `/v1` suffix!)
- `api_key`: `"sk-dummy"`
- `provider`: `"openai"`

### Example: Mixed Configuration

```json
{
  "custom_models": [
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

## Available Claude Models

After configuring, you'll have access to these models in Droid:

| Model ID                     | Description                             |
| ---------------------------- | --------------------------------------- |
| `claude-opus-4-5-20251101`   | Claude Opus 4.5 (Latest & Most Capable) |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 (Balanced)            |
| `claude-opus-4-1-20250805`   | Claude Opus 4.1                         |
| `claude-sonnet-4-20250514`   | Claude Sonnet 4                         |
| `claude-haiku-4-5-20251001`  | Claude Haiku 4.5 (Fast)                 |
| `claude-3-7-sonnet-20250219` | Claude 3.7 Sonnet                       |
| `claude-3-5-haiku-20241022`  | Claude 3.5 Haiku                        |

### Which Model Should I Use?

- **Opus 4.5** - Best for complex coding tasks, architecture decisions, large refactors
- **Sonnet 4.5** - Great balance of speed and capability for most coding tasks
- **Haiku 4.5** - Fastest, best for quick questions and simple tasks

## Verification

### 1. Check CLIProxyAPI Status

{{command:status-service}}

### 2. List Available Models

{{command:list-models}}

You should see all Claude models listed with `"owned_by": "anthropic"`.

### 3. Test the API

{{command:test-claude}}

Should return a response from Claude.

### 4. Restart Droid

After updating the config, restart Factory Droid to pick up the new models.

## Troubleshooting

### Models Don't Appear in Droid

**Check config file syntax:**

```bash
cat ~/.factory/config.json | jq .
```

If this fails, you have a JSON syntax error.

**Verify CLIProxyAPI is running:**

{{command:status-service}}

**Check you added sk-dummy to CLIProxyAPI config:**

{{command:edit-config}}

Ensure this section exists:

```yaml
api-keys:
  - 'sk-dummy'
```

Then restart:
{{command:restart-service}}

### 401 "Invalid API key" Error

**Solution**: The API key in Droid's config doesn't match CLIProxyAPI's allowed keys.

1. Check what key you're using in `~/.factory/config.json`
2. Make sure that exact key is in `~/cliproxyapi/config.yaml` under `api-keys`
3. Restart CLIProxyAPI: {{command:restart-service}}

### Connection Refused Error

**CLIProxyAPI is not running.**

Start it:
{{command:start-service}}

### Model Requests Timeout

**Check CLIProxyAPI logs:**

{{command:view-logs}}

Common issues:

- OAuth token expired (auto-refreshes every 15min, but may need manual re-auth)
- Network/firewall blocking Claude API
- Claude Code subscription quota exceeded

**Re-authenticate if needed:**

{{command:login-claude}}

## Advanced Configuration

### Custom Display Names

Add `model_display_name` field in Droid config:

```json
{
  "model_display_name": "Claude Opus 4.5 [via CLIProxyAPI]",
  "model": "claude-opus-4-5-20251101",
  "base_url": "http://127.0.0.1:8317",
  "api_key": "sk-dummy",
  "provider": "anthropic"
}
```

### Max Tokens

Limit response length:

```json
{
  "model": "claude-opus-4-5-20251101",
  "base_url": "http://127.0.0.1:8317",
  "api_key": "sk-dummy",
  "provider": "anthropic",
  "max_tokens": 8192
}
```

### Multiple API Keys

Use different keys for different models (useful for quota management):

**In CLIProxyAPI config.yaml:**

```yaml
api-keys:
  - 'sk-team-a'
  - 'sk-team-b'
```

**In Droid config.json:**

```json
{
  "custom_models": [
    {
      "model": "claude-opus-4-5-20251101",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-team-a",
      "provider": "anthropic"
    },
    {
      "model": "claude-sonnet-4-5-20250929",
      "base_url": "http://127.0.0.1:8317",
      "api_key": "sk-team-b",
      "provider": "anthropic"
    }
  ]
}
```

## Remote Access (Optional)

If you want to use CLIProxyAPI from another machine:

**1. Configure CLIProxyAPI to bind to all interfaces:**

{{command:edit-config}}

```yaml
host: '0.0.0.0' # Listen on all interfaces
port: 8317
```

**2. Update Droid config with your server IP:**

```json
{
  "model": "claude-opus-4-5-20251101",
  "base_url": "http://YOUR_SERVER_IP:8317",
  "api_key": "sk-dummy",
  "provider": "anthropic"
}
```

**⚠️ Security Warning**: This exposes your proxy to the network. Use firewall rules or VPN to restrict access.

## Next Steps

Once configured:

1. **Restart Droid** to load new models
2. **Select a Claude model** from the model picker
3. **Start coding!** You're now using your Claude Code subscription through CLIProxyAPI

## Resources

- Back to main guide: See "Setup Guide" doc
- CLIProxyAPI Docs: {{command:open-docs}}
- GitHub: {{command:open-github}}

---

**Need more help?** Check the {{command:view-logs}} for error details or visit the documentation.
