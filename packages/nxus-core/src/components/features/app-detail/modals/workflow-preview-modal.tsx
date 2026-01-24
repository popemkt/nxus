import { FlowArrow } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@nxus/ui'
import type { WorkflowDefinition } from '@nxus/db'
import { WorkflowGraphCanvas } from '../../workflow/workflow-graph-canvas'

interface WorkflowPreviewModalProps {
  commandName: string
  workflow: WorkflowDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Modal to preview a workflow command's graph visualization
 */
export function WorkflowPreviewModal({
  commandName,
  workflow,
  open,
  onOpenChange,
}: WorkflowPreviewModalProps) {
  const stepCount = workflow.steps?.length ?? 0

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <FlowArrow className="h-5 w-5 text-primary" />
            <AlertDialogTitle className="font-mono text-sm">
              {commandName}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Workflow visualization with {stepCount} step
            {stepCount !== 1 ? 's' : ''}.
            {workflow.description && ` ${workflow.description}`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex-1 overflow-hidden rounded-md border bg-muted/30 min-h-[400px] h-[500px]">
          <WorkflowGraphCanvas
            workflow={workflow}
            className="h-full"
            showLegend
            showMinimap
            showControls
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
