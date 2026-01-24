# Workflows

Workflows are the automation engine of Nxus. They allow you to chain multiple commands together to perform complex, multi-step operations with a single click.

## What is a Workflow?

A workflow is a special type of command (`mode: "workflow"`) that contains a sequence of steps. Each step can be another command defined in your manifest.

## Defining a Workflow

In your `manifest.json`, define a command with `mode: "workflow"`:

```json
"full-setup": {
  "mode": "workflow",
  "workflow": [
    { "command": "clone-repo" },
    { "command": "install-deps" },
    { "command": "run-build" },
    { "command": "open-project" }
  ]
}
```

## How It Works

1. **Sequential Execution**: Nxus runs each step in order.
2. **Success Requirement**: By default, if a step fails (returns a non-zero exit code), the workflow stops.
3. **Context Preservation**: Workflows often run within the same working directory, allowing subsequent steps to build upon previous ones (e.g., `npm install` after `git clone`).

## Visual Workflow Editor (Coming Soon)

We are working on a visual graph editor that will allow you to design workflows by dragging and dropping nodes, connecting outputs to inputs, and handling complex branching logic.

## Advanced Usage

Workflows can also include:

- **Parameter Mapping**: Passing input from the user to specific steps.
- **Conditional Steps**: Running a step only if a certain condition is met (e.g., if a file exists).

---

Reference: check the [Manifest Schema](../reference/manifest-schema.md) for a full list of workflow properties.
