# Manifest Schema Reference

The `manifest.json` file is the source of truth for every application and tool in Nxus. This document details all available properties.

## Root Properties

| Property      | Type       | Description                                                            |
| :------------ | :--------- | :--------------------------------------------------------------------- |
| `id`          | `string`   | **Required.** Unique identifier for the app.                           |
| `name`        | `string`   | **Required.** Display name of the app.                                 |
| `description` | `string`   | A brief summary of the app.                                            |
| `category`    | `string`   | Primary category (e.g., `utility`, `dev`, `design`).                   |
| `tags`        | `string[]` | List of tags for grouping and search.                                  |
| `version`     | `string`   | Current version of the app.                                            |
| `author`      | `string`   | Author or team name.                                                   |
| `commands`    | `object`   | An object where keys are command IDs and values are `Command` objects. |

## Command Object

Each command in the `commands` object has the following structure:

| Property      | Type                 | Description                                                                      |
| :------------ | :------------------- | :------------------------------------------------------------------------------- |
| `mode`        | `enum`               | **Required.** One of: `execute`, `terminal`, `open`, `copy`, `workflow`, `docs`. |
| `command`     | `string` \| `object` | The executable string or platform-specific object.                               |
| `label`       | `string`             | Human-readable label for the command button.                                     |
| `description` | `string`             | Help text for the command.                                                       |
| `requires`    | `string[]`           | List of system requirements (e.g., `git`, `docker`).                             |

### Platform-Specific Commands

Instead of a single string, `command` can be an object:

```json
"command": {
  "win32": "dir",
  "darwin": "ls -G",
  "linux": "ls --color"
}
```

## Workflow Specifics

When `mode` is `workflow`, the following property is used:

| Property   | Type    | Description             |
| :--------- | :------ | :---------------------- |
| `workflow` | `array` | A list of step objects. |

### Step Object

| Property      | Type      | Description                                                        |
| :------------ | :-------- | :----------------------------------------------------------------- |
| `command`     | `string`  | The ID of another command in the same manifest.                    |
| `stopOnError` | `boolean` | Whether to halt the workflow if this step fails. (Default: `true`) |

---

Example Manifest: [curl manifest](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps/curl/manifest.json)
