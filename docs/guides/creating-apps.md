# Creating Apps for Nxus

Adding a new tool or application to Nxus is designed to be simple and declarative. You don't need to write any C++ or complex integration code; you just need a `manifest.json` file.

## Step 1: Create the Folder Structure

All Nxus apps are stored in `packages/nxus-core/src/data/apps/`. Create a new folder for your app:

```bash
mkdir packages/nxus-core/src/data/apps/my-cool-tool
```

## Step 2: Create the `manifest.json`

The manifest defines everything Nxus needs to know about your tool. Create `manifest.json` in your new folder:

```json
{
  "id": "my-cool-tool",
  "name": "My Cool Tool",
  "description": "A brief description of what this tool does.",
  "category": "utility",
  "tags": ["cli", "productivity"],
  "version": "1.0.0",
  "author": "Your Name",
  "commands": {
    "hello": {
      "mode": "execute",
      "command": "echo 'Hello from Nxus!'"
    }
  }
}
```

## Step 3: Define Commands

You can add multiple commands with different modes. For example, to open a documentation URL:

```json
"docs": {
  "mode": "open",
  "command": "https://example.com/docs"
}
```

Or to run a script:

```json
"setup": {
  "mode": "execute",
  "command": "npm install && npm run build"
}
```

## Step 4: Register the App

Once your manifest is ready, you need to sync it with the Nxus database.

1. **Run the Migration**:

   ```bash
   pnpm db:migrate
   ```

   This script scans the `apps` directory and updates the SQLite database with your new manifest.

2. **Verify in the UI**:
   Open the Nxus dashboard. Your new app should now appear in the list and be searchable in the Command Palette.

## Best Practices

- **Unique IDs**: Ensure your app `id` is unique and doesn't conflict with existing ones.
- **Descriptive Names**: Use names that make sense to users.
- **OS Specifics**: If your command differs between Windows and Linux, use the platform-specific object format (see [Command System Reference](../architecture/command-system.md)).

---

Next: Learn how to automate tasks with [Workflows](workflows.md).
