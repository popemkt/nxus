# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

**Difficulty Assessment**: Medium-Hard

**Summary**:
- Workflow command system (Phase 1) is already implemented and working
- Graph visualization infrastructure exists (React Flow, dagre, d3-force)
- Need to create workflow-specific visualization components
- Integration point is the command button component for workflow mode

**Output**: See `spec.md` for full technical specification.

---

### [x] Step: Create Workflow Graph Hook
<!-- chat-id: 09da5add-73e0-4e67-8ef0-0ac904d244ec -->

Create the conversion hook that transforms a `WorkflowDefinition` into React Flow nodes and edges.

**Files to create**:
- `packages/nxus-core/src/components/features/workflow/types.ts`
- `packages/nxus-core/src/components/features/workflow/hooks/use-workflow-graph.ts`

**Implementation details**:
1. Define `WorkflowNodeData` and `WorkflowEdgeData` interfaces
2. Implement `workflowToGraph()` function that:
   - Creates a node for each step in `workflow.steps`
   - Creates edges for `onSuccess`, `onFailure`, `next`, and `branches`
   - Handles the `parallel` step type by creating edges to child steps
3. Apply dagre layout algorithm for clean node positioning

**Verification**:
- Unit test the conversion with various workflow structures
- Run `pnpm -C packages/nxus-core typecheck`

---

### [x] Step: Create Workflow Step Node Component
<!-- chat-id: 48c85d2c-b8ae-4a86-9a35-6d5363030b20 -->

Create the visual node component for workflow steps.

**Files to create**:
- `packages/nxus-core/src/components/features/workflow/components/workflow-step-node.tsx`

**Implementation details**:
1. Handle all 7 step types with distinct visuals:
   - `command`: Terminal icon, blue, rectangle
   - `condition`: GitBranch icon, purple, diamond shape
   - `parallel`: Rows icon, cyan, wide rectangle
   - `delay`: Clock icon, yellow, circle
   - `notify`: Bell icon, green, rounded rectangle
   - `prompt`: ChatCircle icon, orange, rounded rectangle
   - `end`: CheckCircle/XCircle icon, green/red, circle
2. Display step ID as label
3. Show relevant info (command ref, expression, message) on hover or in node

**Verification**:
- Visual inspection of each node type
- Run `pnpm -C packages/nxus-core typecheck`

---

### [ ] Step: Create Workflow Edge Component

Create the edge component for workflow transitions.

**Files to create**:
- `packages/nxus-core/src/components/features/workflow/components/workflow-edge.tsx`

**Implementation details**:
1. Different styles for edge types:
   - Success: Green solid line
   - Failure: Red dashed line
   - Next/Default: Gray solid line
   - Branch: Gray with label
2. Add arrow markers
3. Optional edge labels for branch values

**Verification**:
- Visual inspection of edges
- Run `pnpm -C packages/nxus-core typecheck`

---

### [ ] Step: Create Workflow Graph Canvas

Create the main canvas component that displays the workflow graph.

**Files to create**:
- `packages/nxus-core/src/components/features/workflow/workflow-graph-canvas.tsx`
- `packages/nxus-core/src/components/features/workflow/components/workflow-legend.tsx`
- `packages/nxus-core/src/components/features/workflow/index.ts`

**Implementation details**:
1. Use ReactFlowProvider wrapper
2. Register custom node and edge types
3. Use `useWorkflowGraph` hook to get nodes/edges
4. Apply dagre layout (LR direction for left-to-right flow)
5. Add Background, MiniMap, and Controls
6. Add legend showing step type colors

**Verification**:
- Test with a sample workflow definition
- Run `pnpm -C packages/nxus-core typecheck`

---

### [ ] Step: Create Workflow Preview Modal

Create the modal component to display the workflow graph.

**Files to create**:
- `packages/nxus-core/src/components/features/app-detail/modals/workflow-preview-modal.tsx`

**Implementation details**:
1. Use Dialog component from shadcn/ui
2. Take `WorkflowDefinition` and command name as props
3. Render `WorkflowGraphCanvas` inside the modal
4. Set reasonable modal size (e.g., 800x600 or responsive)

**Verification**:
- Open modal and verify graph renders correctly
- Run `pnpm -C packages/nxus-core typecheck`

---

### [ ] Step: Integrate with Command Button

Add workflow visualization to the command button component.

**Files to modify**:
- `packages/nxus-core/src/components/features/app-detail/commands/command-button.tsx`

**Implementation details**:
1. For `mode === 'workflow'`, add a preview button (similar to script preview)
2. Use a graph icon (e.g., `FlowArrow` or `TreeStructure`)
3. On click, open `WorkflowPreviewModal`
4. Pass the command's `workflow` definition to the modal

**Verification**:
- Navigate to an app with a workflow command
- Click the preview button
- Verify modal opens with correct graph

---

### [ ] Step: Final Testing & Polish

End-to-end verification and polish.

**Tasks**:
1. Create a test workflow command in a manifest if none exists
2. Test all step types visually
3. Test edge rendering for all transition types
4. Run full lint and typecheck:
   ```bash
   pnpm -C packages/nxus-core typecheck
   pnpm -C packages/nxus-core lint
   pnpm -C packages/nxus-core build
   ```
5. Fix any issues found
6. Write `report.md` documenting the implementation

**Verification**:
- All commands pass
- Feature works end-to-end
