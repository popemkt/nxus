# Workflow Graph Visualization - Implementation Report

## Overview

This implementation adds a graph visualization feature for workflow commands in the Nxus application. Users can now visually preview workflow structures through an interactive graph canvas, making complex multi-step workflows easier to understand.

## Files Created

### Core Types (`packages/nxus-core/src/components/features/workflow/types.ts`)
- `WorkflowNodeData` - Data interface for workflow graph nodes
- `WorkflowEdgeData` - Data interface for workflow graph edges
- `STEP_TYPE_COLORS` - Color mapping for each step type
- `EDGE_TYPE_STYLES` - Style mapping for each edge type (stroke color, dash pattern)

### Conversion Hook (`packages/nxus-core/src/components/features/workflow/hooks/use-workflow-graph.ts`)
- `workflowToGraph()` - Converts `WorkflowDefinition` to React Flow nodes/edges
- `applyDagreLayout()` - Applies dagre layout algorithm for automatic positioning
- `useWorkflowGraph()` - React hook combining conversion and layout

### Node Component (`packages/nxus-core/src/components/features/workflow/components/workflow-step-node.tsx`)
- `WorkflowStepNode` - Custom React Flow node component
- Visual distinction for all 7 step types:
  - **command**: Blue rectangle with terminal icon
  - **condition**: Purple diamond with branch icon
  - **parallel**: Cyan wide rectangle with rows icon
  - **delay**: Yellow circle with clock icon
  - **notify**: Green rounded rectangle with bell icon
  - **prompt**: Orange rounded rectangle with chat icon
  - **end**: Green/red circle with check/X icon (based on status)
- `workflowNodeTypes` - Node type registry for React Flow

### Edge Component (`packages/nxus-core/src/components/features/workflow/components/workflow-edge.tsx`)
- `WorkflowEdge` - Custom React Flow edge component
- `WorkflowEdgeMarkerDefs` - SVG marker definitions for arrows
- Edge styles by transition type:
  - **success**: Green solid line
  - **failure**: Red dashed line
  - **next**: Gray solid line
  - **branch**: Gray solid line with label
  - **parallel**: Cyan dashed line
- `workflowEdgeTypes` - Edge type registry for React Flow

### Legend Component (`packages/nxus-core/src/components/features/workflow/components/workflow-legend.tsx`)
- `WorkflowLegend` - Panel showing step types and edge styles
- Displays all step type icons with colors
- Displays all edge type lines with styles

### Canvas Component (`packages/nxus-core/src/components/features/workflow/workflow-graph-canvas.tsx`)
- `WorkflowGraphCanvas` - Main visualization component
- Features:
  - Automatic dagre layout (LR or TB direction)
  - Background with dot pattern
  - MiniMap for navigation
  - Controls for zoom/pan
  - Legend panel
  - Fit view on load
  - Selectable nodes/edges

### Index (`packages/nxus-core/src/components/features/workflow/index.ts`)
- Exports all public API

### Preview Modal (`packages/nxus-core/src/components/features/app-detail/modals/workflow-preview-modal.tsx`)
- `WorkflowPreviewModal` - Modal wrapper for the graph canvas
- Shows command name, step count, and optional description
- Responsive sizing (max-width 4xl, max-height 85vh)

## Files Modified

### Command Button (`packages/nxus-core/src/components/features/app-detail/commands/command-button.tsx`)
- Added workflow preview button (FlowArrow icon) for workflow commands
- Integrated `WorkflowPreviewModal`
- Preview button appears next to main command button

### Test Manifest (`packages/nxus-core/src/data/apps/_nxus-dev/manifest.json`)
- Added `workflow-demo` command demonstrating all step types:
  - condition step with multiple branches
  - notify steps at different levels
  - prompt step with options
  - parallel step with child tasks
  - delay step
  - command steps with success/failure paths
  - end steps (success and failure)

## Dependencies Used

- `@xyflow/react` - React Flow for graph visualization
- `dagre` - Graph layout algorithm
- `@phosphor-icons/react` - Icons for step types
- `@nxus/ui` - UI components (Button, AlertDialog, cn utility)
- `@nxus/db` - Type definitions (WorkflowDefinition, WorkflowStep)

## How to Test

1. Start the dev server: `pnpm dev`
2. Navigate to "Nxus Development" app
3. Find either "Full Database Setup" or "Workflow Demo (All Step Types)" command
4. Click the FlowArrow icon next to the command button
5. Verify the graph renders with:
   - Correct node shapes and colors for each step type
   - Correct edge styles (solid/dashed, colors, arrows)
   - Working minimap navigation
   - Working zoom/pan controls
   - Legend showing all types

## Known Limitations

1. **Build issue**: There's a pre-existing CSS/Tailwind build error unrelated to this feature (`@source` directive issue)
2. **TypeScript check**: Direct `tsc` runs fail due to project reference configuration, but vite dev server validates successfully
3. **Edge overlap**: Complex workflows may have overlapping edges due to automatic layout

## Future Improvements

1. Add step detail panel on node click
2. Add execution state visualization (running, completed, failed)
3. Add edge routing to avoid overlaps
4. Add export to PNG/SVG functionality
5. Add workflow editing capabilities
