# Quirks & Tips for GLM Configuration

Personal notes and tips for working with Claude Code + GLM.

## Known Quirks

### API Timeout Issues

The default API timeout may be too short for complex operations. The recommended timeout is `3000000ms` (50 minutes).

If you experience timeouts, ensure your configuration includes:

```bash
export API_TIMEOUT_MS="3000000"
```

### Model Compatibility

Not all Claude Code features work identically with GLM. Some differences:

- **Vision capabilities**: May have different performance
- **Tool use**: Generally works well
- **Long context**: Supported up to GLM limits

## Tips for Best Results

1. **Use the configuration modal** for easy setup: {{command:configure}}

2. **Keep your API key secure** - don't commit it to git!

3. **Monitor usage** through the Z.AI dashboard

4. **Fall back to Anthropic** if GLM experiences issues:
   - Simply unset the environment variables
   - Or use a different terminal session

## Troubleshooting

### "Authentication failed" errors

- Verify your API key is correct
- Check if the key has the necessary permissions
- Ensure the base URL is correct: `https://open.bigmodel.cn/api/paas/v4/`

### "Connection timeout" errors

- Check your network connectivity
- Try increasing the API_TIMEOUT_MS value
- The Z.AI service may be experiencing high load

### Command not found

Make sure Claude Code is installed globally:

```bash
npm install -g @anthropic-ai/claude-code
```
