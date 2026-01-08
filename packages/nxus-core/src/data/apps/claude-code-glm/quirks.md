# Quirks & Tips for GLM Configuration

Tips for working with Claude Code + GLM.

## Known Quirks

### API Timeout Issues

The default API timeout in the Z.AI helper is set to `3000000ms` (50 minutes), which is recommended for complex operations.

### Model Compatibility

Not all Claude Code features work identically with GLM. Some differences:

- **Vision capabilities**: Different performance characteristics.
- **Tool use**: Generally robust.
- **Long context**: Supported within GLM limits.

## Tips for Best Results

1. **Use the coding helper** for most setup needs: {{command:run-helper}}

2. **Clean slate**: If things get messy, use {{command:reset-settings}} to clear your configuration and try again.

3. **Check Documentation**: The official Z.AI docs are the best source for the latest updates: {{command:docs-glm}}

## Troubleshooting

### "Authentication failed" errors

- Run the helper again to verify your API key.
- Check the Z.AI dashboard for key status.

### "Command not found"

Ensure Claude Code is installed globally:

```bash
npm install -g @anthropic-ai/claude-code
```
