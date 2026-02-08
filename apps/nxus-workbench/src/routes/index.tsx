import { createFileRoute } from '@tanstack/react-router'
import { NodeWorkbenchRoute } from '@nxus/workbench'

export const Route = createFileRoute('/')({
  component: WorkbenchPage,
})

function WorkbenchPage() {
  return <NodeWorkbenchRoute />
}
