# Setup Guide for Claude Code with GLM

This guide will help you configure Claude Code to work with Z.AI's GLM model using the automated helper.

## Prerequisites

Before you begin, ensure Claude Code is installed:

{{command:claude-code:install-claude-code}}

## Step 1: Run the Z.AI Helper

The easiest way to configure Claude Code for Z.AI is to run the automated coding tool helper:

{{command:run-helper}}

This tool will:

1. Verify Your Node.js environment.
2. Guide you through obtaining and entering your Z.AI API key.
3. Automatically configure your `~/.claude/settings.json`.

## Step 2: Verify Configuration

After running the helper, you can start using Claude Code in any project:

```bash
cd your-project
claude
```

## Troubleshooting

If you need to view or manually edit your configuration, you can open the settings directory:

{{command:open-settings}}

If you need to start fresh or re-authenticate, you can reset your configuration:

{{command:reset-settings}}

For more details, visit the official documentation:

{{command:docs-glm}}
