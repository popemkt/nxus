# Workflow Command Type Design

A new command `mode: 'workflow'` that enables graph-based command chaining with cross-item references.

## Overview

Workflows are commands that execute other commands in sequence, parallel, or conditionally. They can reference commands from any item, enabling powerful automation chains.

## Schema

### Command Definition

```json
{
  "id": "full-db-setup",
  "name": "Full Database Setup",
  "description": "Bootstrap and seed the database based on architecture mode",
  "icon": "FlowArrow",
  "category": "Automation",
  "target": "item",
  "mode": "workflow",
  "workflow": {
    "steps": [
      {
        "id": "start",
        "type": "command",
        "ref": "bootstrap",
        "onSuccess": "check-mode",
        "onFailure": "error-handler"
      },
      {
        "id": "check-mode",
        "type": "condition",
        "expression": "env.ARCHITECTURE_TYPE",
        "branches": {
          "node": "seed-nodes",
          "table": "seed-legacy",
          "default": "seed-nodes"
        }
      },
      {
        "id": "seed-nodes",
        "type": "command",
        "ref": "seed-nodes",
        "onSuccess": "done"
      },
      {
        "id": "seed-legacy",
        "type": "command",
        "ref": "_nxus-dev:seed-legacy",
        "onSuccess": "done"
      },
      {
        "id": "error-handler",
        "type": "notify",
        "message": "Setup failed at step: {{previousStep.id}}"
      },
      {
        "id": "done",
        "type": "end"
      }
    ]
  }
}
```

## Step Types

### 1. `command` - Execute a Command

```json
{
  "id": "step-1",
  "type": "command",
  "ref": "command-id", // Same item
  "ref": "item-id:command-id", // Cross-item reference
  "params": { "key": "value" }, // Optional params
  "onSuccess": "next-step",
  "onFailure": "error-step",
  "timeout": 60000 // Optional timeout (ms)
}
```

### 2. `condition` - Branch Based on Value

```json
{
  "id": "check",
  "type": "condition",
  "expression": "env.ARCHITECTURE_TYPE", // or "result.exitCode", "result.stdout"
  "branches": {
    "node": "step-a",
    "table": "step-b",
    "default": "step-c"
  }
}
```

### 3. `parallel` - Run Multiple Steps Concurrently

```json
{
  "id": "parallel-setup",
  "type": "parallel",
  "steps": ["step-a", "step-b", "step-c"],
  "waitFor": "all", // or "any", "none"
  "onComplete": "next-step"
}
```

### 4. `delay` - Wait

```json
{
  "id": "wait",
  "type": "delay",
  "duration": 2000, // ms
  "next": "next-step"
}
```

### 5. `notify` - Show Message

```json
{
  "id": "notify-user",
  "type": "notify",
  "message": "Setup complete!",
  "level": "success", // or "info", "warning", "error"
  "next": "next-step"
}
```

### 6. `prompt` - User Input (Interactive)

```json
{
  "id": "ask-mode",
  "type": "prompt",
  "message": "Select architecture mode:",
  "options": ["node", "table", "graph"],
  "variable": "selectedMode",
  "next": "use-mode"
}
```

### 7. `end` - Workflow Complete

```json
{
  "id": "done",
  "type": "end",
  "status": "success" // or "failure"
}
```

## Cross-Item References

Commands can reference other items using `item-id:command-id` syntax:

```json
{
  "ref": "_nxus-dev:bootstrap"      // Item _nxus-dev, command bootstrap
  "ref": "docker:start-container"   // Item docker, command start-container
  "ref": "local-command"            // Same item, command local-command
}
```

## Context & Variables

Workflows have access to:

```typescript
interface WorkflowContext {
  env: Record<string, string>; // Environment variables
  params: Record<string, unknown>; // Workflow params
  results: Record<string, StepResult>; // Results from previous steps
  variables: Record<string, unknown>; // User-set variables
}

interface StepResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

## Expression Syntax

Conditions can use dot notation:

- `env.ARCHITECTURE_TYPE` - Environment variable
- `results.step-1.exitCode` - Previous step result
- `variables.selectedMode` - User variable
- `params.targetPath` - Workflow parameter

## UI Representation

### Workflow Editor (Future)

```
┌─────────────────────────────────────────────────┐
│  📊 Full Database Setup                         │
├─────────────────────────────────────────────────┤
│                                                 │
│    ┌─────────┐                                  │
│    │ Start   │                                  │
│    │Bootstrap│                                  │
│    └────┬────┘                                  │
│         │                                       │
│    ┌────▼────┐                                  │
│    │ Check   │                                  │
│    │  Mode   │                                  │
│    └────┬────┘                                  │
│      ┌──┴──┐                                    │
│   ┌──▼──┐┌─▼──┐                                │
│   │Node ││Table│                               │
│   │Seed ││Seed │                               │
│   └──┬──┘└──┬──┘                               │
│      └──┬───┘                                  │
│    ┌────▼────┐                                  │
│    │  Done   │                                  │
│    └─────────┘                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Schema & Types

- [ ] Add `workflow` property to `ItemCommand` type
- [ ] Define `WorkflowStep`, `WorkflowContext` types
- [ ] Add `mode: 'workflow'` to command mode enum

### Phase 2: Execution Engine

- [ ] Create `WorkflowExecutor` service
- [ ] Implement step type handlers
- [ ] Add cross-item command resolution

### Phase 3: Node Integration

- [ ] Add `#Workflow` supertag (optional)
- [ ] Store workflow definitions in nodes
- [ ] Enable workflow nodes to reference command nodes

### Phase 4: UI

- [ ] Workflow visualization in command details
- [ ] Step execution status display
- [ ] Interactive prompt support

## Example Workflows

### 1. Database Reset with Backup

```json
{
  "id": "safe-reset",
  "name": "Safe Database Reset",
  "mode": "workflow",
  "workflow": {
    "steps": [
      {
        "id": "backup",
        "type": "command",
        "ref": "export",
        "onSuccess": "reset"
      },
      {
        "id": "reset",
        "type": "command",
        "ref": "reset-nodes",
        "onSuccess": "done"
      },
      {
        "id": "done",
        "type": "notify",
        "message": "Reset complete! Backup saved."
      }
    ]
  }
}
```

### 2. Multi-Tool Setup

```json
{
  "id": "ai-dev-setup",
  "name": "AI Development Environment",
  "mode": "workflow",
  "workflow": {
    "steps": [
      {
        "id": "parallel-install",
        "type": "parallel",
        "steps": ["install-claude", "install-goose", "install-opencode"],
        "onComplete": "done"
      },
      {
        "id": "install-claude",
        "type": "command",
        "ref": "claude-code:install-claude-code"
      },
      { "id": "install-goose", "type": "command", "ref": "goose:install" },
      {
        "id": "install-opencode",
        "type": "command",
        "ref": "opencode:install"
      },
      { "id": "done", "type": "notify", "message": "All AI tools installed!" }
    ]
  }
}
```

## Questions for Review

1. **Persistence**: Should workflow execution state be persisted (for resume after crash)?
2. **Scheduling**: Should workflows support cron-like scheduling?
3. **Approval Gates**: Should workflows support "wait for user approval" steps?
4. **Secrets**: How to handle sensitive data in workflow params?
