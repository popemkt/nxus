# Workflow Command Implementation Spec

Implementation plan and task tracking for the workflow command feature.

> **Related**: See [workflow-command-design.md](./workflow-command-design.md) for the original design document.

---

## Proposed Changes

### Types Layer

#### [MODIFY] [item.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/types/item.ts)

- Add `'workflow'` to `CommandModeSchema` enum
- Add optional `workflow?: WorkflowDefinition` property to `ItemCommandSchema`

#### [NEW] [workflow.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/types/workflow.ts)

Workflow-specific types:

```typescript
// Step types: command, condition, parallel, delay, notify, prompt, end
interface WorkflowStep { id, type, ...type-specific fields }

// Execution context
interface WorkflowContext {
  env: Record<string, string>;
  params: Record<string, unknown>;
  results: Record<string, StepResult>;
  variables: Record<string, unknown>;
}

interface StepResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

interface WorkflowDefinition {
  steps: WorkflowStep[];
}
```

---

### Services Layer

#### [NEW] [workflow-executor.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/workflow/workflow-executor.ts)

Core engine that:

- Resolves step references (local `bootstrap` or cross-item `_nxus-dev:seed-nodes`)
- Executes steps based on type
- Handles branching via `condition` type
- Runs parallel steps with `Promise.all`
- Tracks results in `WorkflowContext`

#### [NEW] [workflow-context.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/workflow/workflow-context.ts)

Context factory providing:

- `env` from `process.env`
- Expression evaluation for conditions (e.g., `env.ARCHITECTURE_TYPE`)
- Results storage keyed by step ID

#### [MODIFY] [command-execution.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/lib/command-execution.ts)

Add workflow mode handling:

```typescript
if (command.mode === 'workflow' && command.workflow) {
  return executeWorkflow(command.workflow, item, context);
}
```

---

### Example Workflow

#### [MODIFY] [manifest.json](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps/_nxus-dev/manifest.json)

Add example workflow command:

```json
{
  "id": "full-db-setup",
  "name": "Full Database Setup",
  "description": "Bootstrap and seed the database",
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
        "onSuccess": "seed"
      },
      {
        "id": "seed",
        "type": "command",
        "ref": "seed-nodes",
        "onSuccess": "done"
      },
      { "id": "done", "type": "notify", "message": "Setup complete!" }
    ]
  }
}
```

---

## Task Checklist

### Phase 1: Schema & Types

- [ ] Add `'workflow'` to `CommandModeSchema` in `types/item.ts`
- [ ] Create `types/workflow.ts` with workflow-specific types:
  - [ ] `WorkflowStep` type (command, condition, parallel, delay, notify, prompt, end)
  - [ ] `WorkflowContext` interface (env, params, results, variables)
  - [ ] `WorkflowDefinition` interface
  - [ ] `StepResult` interface
- [ ] Add `workflow?: WorkflowDefinition` property to `ItemCommandSchema`

### Phase 2: Execution Engine

- [ ] Create `services/workflow/workflow-executor.ts`:
  - [ ] Step handler implementations for each step type
  - [ ] Context management
  - [ ] Cross-item command resolution
- [ ] Create `services/workflow/workflow-context.ts`:
  - [ ] Environment variable access
  - [ ] Results tracking
  - [ ] Variable storage
- [ ] Integrate with existing `command-execution.ts`

### Phase 3: Example & Verification

- [ ] Add example workflow command to `_nxus-dev/manifest.json`
- [ ] Test workflow execution via command palette
- [ ] Verify step chaining works correctly

### Future (Out of Scope)

- [ ] UI visualization in command details
- [ ] Interactive prompt support
- [ ] Node integration with `#Workflow` supertag

---

## Verification Plan

### Automated Tests

**New test file**: `services/workflow/workflow-executor.test.ts`

```bash
pnpm --filter nxus-core test
```

Tests to add:

1. Step resolution (local and cross-item refs)
2. Sequential step execution
3. Condition branching
4. Error handling (onFailure paths)

### Manual Verification

1. **Start dev server**: `npx nx dev nxus-core`
2. **Open command palette** (Cmd/Ctrl+K)
3. **Search for "Full Database Setup"** in \_nxus-dev commands
4. **Execute the workflow** and verify:
   - Bootstrap runs first
   - Seed runs after bootstrap succeeds
   - Notification appears on completion
5. **Check terminal output** for proper step sequencing

---

## Open Questions

1. **Prompt steps**: Should interactive `prompt` steps (user input during workflow) be included in Phase 1, or deferred?
2. **Error handling**: Should workflow failures show a toast notification or a detailed log view?
3. **State persistence**: Phase 1 will use in-memory state only (no crash resume). Acceptable?
4. **Persistence**: Should workflow execution state be persisted for resume after crash?
5. **Scheduling**: Should workflows support cron-like scheduling?
6. **Approval Gates**: Should workflows support "wait for user approval" steps?
7. **Secrets**: How to handle sensitive data in workflow params?
