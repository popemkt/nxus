# Manifest Schema Reference

The `manifest.json` file is the source of truth for every application and tool in Nxus. This document details all available properties.

> **Canonical Definition**: See `ItemCommandSchema` in `packages/nxus-db/src/types/item.ts` for the Zod schema.

## Root Properties

| Property      | Type            | Description                                         |
| :------------ | :-------------- | :-------------------------------------------------- |
| `id`          | `string`        | **Required.** Unique identifier for the app.        |
| `name`        | `string`        | **Required.** Display name of the app.              |
| `description` | `string`        | A brief summary of the app.                         |
| `type`        | `enum`          | **Required.** One of: `html`, `typescript`, `remote-repo`, `tool`. |
| `path`        | `string`        | Path or URL to the app source.                      |
| `commands`    | `Command[]`     | Array of command objects (see below).               |
| `docs`        | `DocEntry[]`    | Array of documentation entries.                     |
| `metadata`    | `object`        | Metadata including tags, category, version, author. |
| `status`      | `enum`          | One of: `installed`, `not-installed`, `available`.  |
| `dependencies`| `string[]`      | Item IDs this item depends on.                      |

## Command Object

Each command in the `commands` array has the following structure:

### Base Fields (all command types)

| Property       | Type       | Description                                                       |
| :------------- | :--------- | :---------------------------------------------------------------- |
| `id`           | `string`   | **Required.** Unique command identifier.                          |
| `name`         | `string`   | **Required.** Display name for the command button.                |
| `mode`         | `enum`     | **Required.** One of: `execute`, `terminal`, `copy`, `docs`, `configure`, `script`, `preview`, `workflow`. |
| `description`  | `string`   | Help text for the command.                                        |
| `icon`         | `string`   | **Required.** Phosphor icon name (e.g., `Play`, `Terminal`).      |
| `category`     | `string`   | **Required.** Grouping for UI display.                            |
| `target`       | `enum`     | **Required.** Either `item` or `instance`.                        |
| `override`     | `string`   | ID of a default command to override.                              |
| `platforms`    | `string[]` | Platforms where available: `windows`, `linux`, `macos`.           |
| `requires`     | `object`   | Declarative requirements (see below).                             |
| `requirements` | `array`    | Tagged item selectors (e.g., pick an AI provider).                |
| `params`       | `array`    | User input parameters to collect before execution.                |

### Requirements Object

The `requires` field is an object (not an array):

| Property          | Type       | Description                                           |
| :---------------- | :--------- | :---------------------------------------------------- |
| `tools`           | `string[]` | Tool IDs that must be installed (e.g., `['git']`).    |
| `selfInstalled`   | `boolean`  | Whether the tool itself must be installed.            |
| `selfNotInstalled`| `boolean`  | Whether the tool must NOT be installed (install cmd). |

### Mode-Specific Fields

#### `execute` / `terminal` modes
| Property  | Type     | Description                    |
| :-------- | :------- | :----------------------------- |
| `command` | `string` | Shell command to execute.      |
| `cwd`     | `string` | Working directory override.    |

#### `copy` mode
| Property  | Type     | Description        |
| :-------- | :------- | :----------------- |
| `command` | `string` | Text to copy.      |

#### `docs` mode
| Property  | Type     | Description            |
| :-------- | :------- | :--------------------- |
| `command` | `string` | Documentation URL.     |

#### `script` mode
| Property        | Type     | Description                                          |
| :-------------- | :------- | :--------------------------------------------------- |
| `command`       | `string` | Script filename (e.g., `install.ps1`).               |
| `scriptSource`  | `enum`   | Where to resolve: `nxus-app`, `repo`, or `shared`.   |
| `cwd`           | `string` | Working directory: `scriptLocation`, `instance`, or path. |
| `scriptOptions` | `object` | Options like `{ interactive: true }`.                |

#### `workflow` mode
| Property   | Type     | Description                    |
| :--------- | :------- | :----------------------------- |
| `workflow` | `object` | Workflow definition (see below). |

## Workflow Definition

When `mode` is `workflow`, the `workflow` property contains:

| Property | Type           | Description                |
| :------- | :------------- | :------------------------- |
| `steps`  | `WorkflowStep[]` | Array of step objects.   |

### Step Types

All steps have `id` (string) and `type` (enum). The `type` determines additional fields.

#### `command` step
Execute another command from this item.

| Property    | Type     | Description                                        |
| :---------- | :------- | :------------------------------------------------- |
| `ref`       | `string` | Command ID or `item-id:command-id`.                |
| `params`    | `object` | Parameters to pass to the command.                 |
| `onSuccess` | `string` | Step ID to go to on success.                       |
| `onFailure` | `string` | Step ID to go to on failure.                       |
| `timeout`   | `number` | Timeout in milliseconds.                           |

#### `condition` step
Branch based on an expression.

| Property     | Type     | Description                                        |
| :----------- | :------- | :------------------------------------------------- |
| `expression` | `string` | Expression like `env.VAR`, `results.step.exitCode`.|
| `branches`   | `object` | Map of value → step ID (include `default` key).    |

#### `parallel` step
Run multiple steps concurrently.

| Property     | Type       | Description                                      |
| :----------- | :--------- | :----------------------------------------------- |
| `steps`      | `string[]` | Step IDs to run in parallel.                     |
| `waitFor`    | `enum`     | `all` (default), `any`, or `none`.               |
| `onComplete` | `string`   | Step ID after parallel completes.                |

#### `delay` step
Wait for a duration.

| Property   | Type     | Description               |
| :--------- | :------- | :------------------------ |
| `duration` | `number` | Duration in milliseconds. |
| `next`     | `string` | Next step ID.             |

#### `notify` step
Show a notification.

| Property  | Type     | Description                                     |
| :-------- | :------- | :---------------------------------------------- |
| `message` | `string` | Notification message.                           |
| `level`   | `enum`   | `info`, `success`, `warning`, or `error`.       |
| `next`    | `string` | Next step ID.                                   |

#### `prompt` step
Get user input.

| Property   | Type       | Description                   |
| :--------- | :--------- | :---------------------------- |
| `message`  | `string`   | Prompt message.               |
| `options`  | `string[]` | Available options.            |
| `variable` | `string`   | Variable name to store input. |
| `next`     | `string`   | Next step ID.                 |

#### `end` step
Mark workflow completion.

| Property | Type   | Description                 |
| :------- | :----- | :-------------------------- |
| `status` | `enum` | `success` or `failure`.     |

---

## Example Manifest

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "description": "A sample tool manifest",
  "type": "tool",
  "path": ".",
  "checkCommand": "echo true",
  "platform": ["linux", "macos", "windows"],
  "commands": [
    {
      "id": "build",
      "name": "Build",
      "description": "Build the project",
      "icon": "Hammer",
      "category": "Development",
      "target": "item",
      "mode": "execute",
      "command": "npm run build"
    },
    {
      "id": "setup",
      "name": "Setup Workflow",
      "description": "Run build then test",
      "icon": "FlowArrow",
      "category": "Automation",
      "target": "item",
      "mode": "workflow",
      "workflow": {
        "steps": [
          {
            "id": "run-build",
            "type": "command",
            "ref": "build",
            "onSuccess": "done",
            "onFailure": "failed"
          },
          {
            "id": "done",
            "type": "end",
            "status": "success"
          },
          {
            "id": "failed",
            "type": "end",
            "status": "failure"
          }
        ]
      }
    }
  ],
  "metadata": {
    "tags": [],
    "category": "development-tools",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z"
  },
  "status": "not-installed"
}
```
