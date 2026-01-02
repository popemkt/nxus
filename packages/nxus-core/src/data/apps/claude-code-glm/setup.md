# Setup Guide for Claude Code with GLM

This guide will help you configure Claude Code to work with Z.AI's GLM model.

## Prerequisites

Before you begin, ensure Claude Code is installed:

{{command:install-claude-code}}

## Step 1: Get Your API Key

1. Visit the [Z.AI Open Platform](https://z.ai/model-api)
2. Register or login to your account
3. Navigate to [API Keys](https://z.ai/manage-apikey/apikey-list) management
4. Create a new API key and copy it

## Step 2: Configure Your Environment

There are several ways to configure GLM:

### Option A: Use the Configuration Modal

The easiest way - set your API key through the UI:

{{command:configure}}

### Option B: Add to Shell Profile

For permanent configuration, add to your shell profile:

**Bash users:**

{{command:configure-glm-permanent-bash}}

**Zsh users:**

{{command:configure-glm-permanent-zsh}}

### Option C: Session-Only Configuration

Copy the environment variables for manual use:

{{command:configure-glm-session}}

## Step 3: Verify Configuration

After configuration, run Claude Code in any project:

```bash
cd your-project
claude
```

## Need Help?

Check the official Z.AI documentation:

{{command:docs-glm}}
