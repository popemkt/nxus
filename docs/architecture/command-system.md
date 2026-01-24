# Command System

The Command System is what makes Nxus an active tool rather than just a static database. It handles the execution of varied actions across different platforms.

## Command Modes

Every command in Nxus has a `mode` that defines how it should be executed.

| Mode       | Description                                      | Example                               |
| :--------- | :----------------------------------------------- | :------------------------------------ |
| `execute`  | A standard shell command.                        | `pnpm install`, `ls -la`              |
| `terminal` | Opens a terminal session for the command.        | `ssh user@host`, `vim README.md`      |
| `copy`     | Copies a specific string to the clipboard.       | Copying an API key or a path.         |
| `open`     | Opens a file, folder, or URL in the default app. | Opening the project folder in Finder. |
| `workflow` | Triggers a multi-step sequence of actions.       | Full dev environment setup.           |

## Execution Flow

1. **Trigger**: A user clicks a command in the UI or selects it from the Command Palette.
2. **Resolution**: The system looks up the command node and resolves any parameters or environment variables.
3. **Server Hand-off**: The browser sends the command details to a TanStack Start **Server Function**.
4. **Local Execution**: The Node.js server uses libraries like `execa` to spawn a child process and run the command.
5. **Output Capture**: The server captures `stdout` and `stderr` from the child process.

## Output Streaming

Nxus provides a real-time experience for long-running commands.

- **Reactive Updates**: As the command produces output, the server pushes these updates back to the UI.
- **Terminal UI**: The UI renders this output in a beautiful, reactive terminal component, allowing users to see progress instantly.
- **Persistent Logs**: Command history and logs are often stored (optionally) for later review.

## OS Agnosticism

The command system is designed to handle platform differences gracefully. Commands can specify different strings for Windows, macOS, and Linux within their manifest. The Nxus server detects the host OS and picks the correct version to run.

```typescript
// Example from a manifest.json
"commands": {
  "open-folder": {
    "mode": "open",
    "command": {
      "win32": ".",
      "darwin": "open .",
      "linux": "xdg-open ."
    }
  }
}
```

---

Next: Learn how to contribute by [Creating Apps](../guides/creating-apps.md).
