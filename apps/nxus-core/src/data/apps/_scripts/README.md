# My Scripts

A collection of custom automation scripts for common development tasks.

## Overview

This folder contains utility scripts that automate repetitive tasks. Each script is designed to be simple, focused, and reusable.

## Available Scripts

### 1. Create GitHub Repo (`create-repo.sh`)

Creates a new GitHub repository and initializes a local git folder.

**Prerequisites:**

- GitHub CLI (`gh`) installed and authenticated
- Git installed

**Usage:**

```bash
./create-repo.sh [repo-name] [local-folder-path]
```

**Interactive Mode:**
If you don't provide arguments, the script will prompt you for:

- Repository name
- Local folder path

**What it does:**

1. Creates a new private repository on your GitHub account
2. Creates the local folder if it doesn't exist
3. Initializes git in the folder
4. Adds the GitHub remote
5. Creates an initial commit with a README
6. Pushes to GitHub

## Adding New Scripts

To add a new script to this collection:

1. **Create your script** in this folder (`apps/nxus-core/src/data/apps/_scripts/`)

   ```bash
   touch apps/nxus-core/src/data/apps/_scripts/my-new-script.sh
   chmod +x apps/nxus-core/src/data/apps/_scripts/my-new-script.sh
   ```

2. **Update the manifest** at `manifest.json` (in the same folder)

   Add a new command entry:

   ```json
   {
     "id": "my-new-script",
     "name": "My New Script",
     "description": "What this script does",
     "icon": "IconName",
     "category": "Category",
     "target": "item",
     "mode": "terminal",
     "command": "bash apps/nxus-core/src/data/apps/_scripts/my-new-script.sh",
     "requires": {
       "tools": ["required-tool-ids"]
     }
   }
   ```

3. **Document it** in this README

## Script Guidelines

When creating new scripts:

- ✅ Use clear, descriptive names
- ✅ Add error handling (`set -e`)
- ✅ Include usage instructions in comments
- ✅ Provide colored output for better UX
- ✅ Validate inputs
- ✅ Check for required dependencies
- ✅ Make scripts executable (`chmod +x`)

## Dependencies

All scripts in this collection have access to the following dependencies defined in the manifest:

- `github-cli` - GitHub CLI tool
- `git` - Version control system

Individual scripts may require additional tools - these should be specified in their command's `requires.tools` array.
