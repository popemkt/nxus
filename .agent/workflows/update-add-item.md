---
description: Update or add a new item (app/tool) to the registry
---

# Update or Add Item Workflow

This workflow guides you through adding a new item (app or tool) to the Nxus registry, or updating an existing one. It covers the specific "quirks" and features of the system. Remember, always be thoughtful.

## 1. Understand the Item Type

Before starting, identify what type of item you are working with:

- **`tool`**: A CLI tool or dependency (e.g., `git`, `node`, `github-cli`, `_scripts`).
  - **Quirk**: Can have a `checkCommand` for health status (Installed/Not Found).
  - **Quirk**: Can use `script` mode for complex automation with UI forms.
  - **Quirk**: Can have `configSchema` for user secrets/settings (API keys).
- **`remote-repo`**: A git repository that Nxus manages (clones/pulls).
  - **Quirk**: Needs `installConfig` with platform-specific `git clone` commands (handled via `InstallModal`).
- **`html` / `typescript`**: Local web applications or projects.

## 2. Research & Analyze

1.  **Check Existing Items**: Look at `packages/nxus-core/src/data/apps/` for similar items.
    - Ref: `github-cli` (complex tool, custom install script, uninstaller).
    - Ref: `_scripts` (pure script collection, parameter parsing).
2.  **Gather Documentation**:
    - Official installation guide (for all platforms: Linux, macOS, Windows).
    - Common usage commands.
    - Configuration requirements (env vars, config files).

## 3. Create/Update Manifest

The manifest lives at `packages/nxus-core/src/data/apps/<id>/manifest.json`.

### Essential Fields

- **`id`**: Unique slug (e.g., `my-tool`).
- **`type`**: One of the types above.
- **`dependencies`**: Array of other item IDs required (e.g., `["git"]`).

### Tool Health Checks

- **`checkCommand`**: A command that returns exit code 0 if installed (e.g., `gh --version`).
  - _Important_: If omitted, the tool will NOT show health status (useful for script collections).
  - _System Logic_: Status is cached for 5 mins; refreshed via "Refresh Status" button.

### Configuration (Secret Management)

- **`configSchema`**: Define fields that the user needs to provide (e.g., API tokens).
  - `fields`: Array of `{ key, label, type, required }`.
  - _Usage_: Stored locally in browser `localStorage` (via `toolConfigService`).

## 4. Define Commands

Commands are the primary way users interact with items.

### Command Modes

- **`execute`**: Runs silently in background.
- **`terminal`**: Opens a terminal tab with the command pre-filled or running.
- **`script`**: Runs a local script file (ps1/sh) with **Auto-Generated UI**.
  - _Feature_: If the script has parameters, a modal automatically appears.
  - _Path Picker_: Use `[string] $Path` parameter name containing "path", "folder", or "dir" to get a native folder picker.
  - _Dropdowns_: Use `[ValidateSet("A","B")]` in PowerShell to get a dropdown.
- **`copy`**: Copies text to clipboard.
- **`docs`**: Opens a URL.

### Script Wrapper Pattern

For complex cross-platform logic, don't put giant commands in JSON.

1.  Create `myscript.ps1` in the app folder.
2.  Set `mode: "script"`.
3.  Set `command: "myscript.ps1"` (relative path).
4.  **PowerShell Quirk**: Use `[Parameter()]` attributes for everything. The system strictly parses these to generate the UI.
    - Use `param([string]$RepoName)` -> Text Input
    - Use `param([switch]$Private)` -> Checkbox
    - Use `param([ValidateSet("public","private")][string]$Visibility)` -> Dropdown

## 5. Add Documentation (Optional)

1.  Create `guide.md` in the app folder.
2.  Add to `docs` array in manifest:
    ```json
    "docs": [
      { "id": "guide", "title": "User Guide", "file": "guide.md", "icon": "BookOpen" }
    ]
    ```
3.  **Quirk**: You can embed runnable commands in markdown! Users can click to run.

## 6. Verification Checklist

- [ ] **Manifest Valid**: JSON is valid and matches schema.
- [ ] **Health Check**:
  - [ ] `checkCommand` works (returns 0 if installed).
  - [ ] Status badge shows "Installed" or "Not Found".
  - [ ] "Checking..." badge does not hang (ensure `checkCommand` is present if badge is desired).
- [ ] **Scripts**:
  - [ ] Parameters modal appears for `script` mode.
  - [ ] Folder picker works for path parameters.
  - [ ] Script executes successfully in terminal.
- [ ] **Dependencies**: Missing dependencies show warnings in UI.

## 7. Final User Confirmation

**Mandatory Step**: Before executing and considering the task complete, you MUST explicitly ask the user for confirmation.

- Present the drafted/final result (manifest, commands, UI behavior).
- Ask "Does this meet your expectations?" or "Is there anything else you'd like to adjust?".
- Only after their explicit approval should you close the task or move to the next item.
