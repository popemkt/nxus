/**
 * Node Workbench - Main route for browsing and inspecting nodes
 *
 * Uses the NodeWorkbenchRoute component from @nxus/workbench.
 */

import { createFileRoute } from '@tanstack/react-router'
import { NodeWorkbenchRoute } from '@nxus/workbench'

export const Route = createFileRoute('/nodes')({ component: NodeWorkbench })

function NodeWorkbench() {
  return <NodeWorkbenchRoute />
}
