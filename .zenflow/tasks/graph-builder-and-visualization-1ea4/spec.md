# Technical Specification: Workflow Graph Visualization

## Overview

This feature adds a visual graph representation for workflow commands, allowing users to see the structure and flow of multi-step workflow automations instead of raw JSON.

## Technical Context

### Language & Framework
- **Language**: TypeScript
- **Frontend**: React 19, TanStack Router
- **Graph Library**: `@xyflow/react` v12.10.0 (already installed)
- **Layout Libraries**: `dagre` v0.8.5, `d3-force` v3.0.0 (already installed)
- **State Management**: Zustand, TanStack Query
- **Styling**: Tailwind CSS, shadcn/ui components

### Existing Infrastructure

1. **Workflow Types** (`packages/nxus-db/src/types/workflow.ts`):
   - `WorkflowStep` - Discriminated union of step types (command, condition, parallel, delay, notify, prompt, end)
   - `WorkflowDefinition` - Contains `steps: WorkflowStep[]`
   - `WorkflowContext` - Runtime context during execution

2. **Workflow Executor** (`packages/nxus-core/src/services/workflow/workflow-executor.ts`):
   - Complete Phase 1 implementation
   - Handles all step types except prompt
   - Supports cross-item command references (`item-id:command-id`)

3. **Graph Visualization** (`packages/nxus-core/src/components/features/gallery/item-views/graph-view/`):
   - `graph-canvas.tsx` - Main React Flow canvas (760 lines)
   - `components/item-node.tsx`, `command-node.tsx`, `simple-node.tsx` - Existing node types
   - `components/dependency-edge.tsx` - Edge component
   - Layout algorithms implemented for dagre hierarchical layout

4. **Command UI** (`packages/nxus-core/src/components/features/app-detail/commands/command-button.tsx`):
   - Handles workflow execution at lines 85-103
   - No preview/visualization for workflow mode currently

## Task Difficulty: Medium-Hard

- **Medium**: Graph infrastructure exists and is well-designed
- **Hard**: New node types needed, edge routing logic, integration with command UI

## Implementation Approach

### Core Principle
Reuse existing graph infrastructure while creating workflow-specific node types and a dedicated visualization component.

### What We'll Build

1. **WorkflowGraphCanvas** - A new component specifically for visualizing workflow definitions
2. **Workflow-specific Node Types** - Visual representations for each step type
3. **Workflow Edge Type** - Edges showing step transitions (success/failure paths)
4. **Integration** - Add graph preview to workflow commands in the command list

## Source Code Structure Changes

### New Files

```
packages/nxus-core/src/components/features/workflow/
├── workflow-graph-canvas.tsx       # Main canvas component
├── components/
│   ├── workflow-step-node.tsx      # Unified node for all step types
│   ├── workflow-edge.tsx           # Edge component with labels
│   └── workflow-legend.tsx         # Legend showing step type colors
├── hooks/
│   └── use-workflow-graph.ts       # Hook to convert workflow definition to nodes/edges
└── index.ts                        # Exports
```

### Modified Files

1. `packages/nxus-core/src/components/features/app-detail/commands/command-button.tsx`
   - Add a "View Workflow" button for workflow mode commands (similar to existing preview button)

2. `packages/nxus-core/src/components/features/app-detail/modals/` (new file)
   - `workflow-preview-modal.tsx` - Modal to display the workflow graph

## Data Model / API / Interface Changes

### Workflow Graph Types (new)

```typescript
// packages/nxus-core/src/components/features/workflow/types.ts

export interface WorkflowNodeData {
  stepId: string
  type: WorkflowStep['type']
  label: string
  description?: string
  // Type-specific data
  commandRef?: string           // For 'command' type
  expression?: string           // For 'condition' type
  branches?: Record<string, string>  // For 'condition' type
  parallelSteps?: string[]      // For 'parallel' type
  duration?: number             // For 'delay' type
  message?: string              // For 'notify' type
  level?: string                // For 'notify' type
  status?: 'success' | 'failure'  // For 'end' type
}

export interface WorkflowEdgeData {
  label?: string                // 'onSuccess', 'onFailure', 'default', branch value
  type: 'success' | 'failure' | 'next' | 'branch'
}
```

### Conversion Function

```typescript
// packages/nxus-core/src/components/features/workflow/hooks/use-workflow-graph.ts

function workflowToGraph(workflow: WorkflowDefinition): {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge<WorkflowEdgeData>[]
}
```

## Node Visual Design

Each step type has a distinct visual style:

| Step Type | Icon | Color | Shape |
|-----------|------|-------|-------|
| `command` | Terminal | Blue (#3b82f6) | Rectangle |
| `condition` | GitBranch | Purple (#a855f7) | Diamond |
| `parallel` | Rows | Cyan (#06b6d4) | Wide Rectangle |
| `delay` | Clock | Yellow (#eab308) | Circle |
| `notify` | Bell | Green (#22c55e) | Rounded Rectangle |
| `prompt` | ChatCircle | Orange (#f97316) | Rounded Rectangle |
| `end` | CheckCircle/XCircle | Green/Red | Circle |

## Edge Visual Design

- **Success path**: Green solid line with arrow
- **Failure path**: Red dashed line with arrow
- **Next (default)**: Gray solid line with arrow
- **Branch labels**: Small text label on edge

## Verification Approach

### Automated Tests

1. **Unit Tests** for `useWorkflowGraph` hook:
   - Test conversion of simple linear workflow
   - Test conversion with conditions and branches
   - Test conversion with parallel steps
   - Test handling of missing/invalid step references

2. **Component Tests** for `WorkflowStepNode`:
   - Test rendering each step type
   - Test proper icons and colors

### Manual Verification

1. Create a test workflow command in a manifest
2. Navigate to the app detail page
3. Click "View Workflow" on the workflow command
4. Verify graph displays correctly with:
   - All steps visible
   - Edges connecting properly
   - Legend showing step types
   - Layout looking clean (dagre LR direction)

### Lint/Build Commands

```bash
# Type checking
pnpm -C packages/nxus-core typecheck

# Linting
pnpm -C packages/nxus-core lint

# Build
pnpm -C packages/nxus-core build

# Run tests (if test infrastructure exists)
pnpm -C packages/nxus-core test
```

## Implementation Phases

### Phase 1: Core Visualization (MVP)
- Create `WorkflowGraphCanvas` component
- Implement `WorkflowStepNode` with all step type visuals
- Implement `useWorkflowGraph` hook for conversion
- Add basic dagre layout

### Phase 2: Integration
- Create `WorkflowPreviewModal`
- Add "View Workflow" button to `CommandButton` for workflow mode
- Wire up the modal to display the graph

### Phase 3: Polish
- Add legend component
- Add edge labels for success/failure/branch paths
- Handle edge cases (empty workflow, circular references)
- Add zoom/pan controls

## Out of Scope (Future Work)

- Interactive workflow editing (drag-and-drop to create workflows)
- Real-time execution visualization (highlighting current step)
- Workflow validation/linting
- Cross-item reference resolution visualization (showing external commands)

## Dependencies

No new npm packages required. All needed libraries are already installed:
- `@xyflow/react`
- `dagre`
- `@phosphor-icons/react` (for step type icons)
