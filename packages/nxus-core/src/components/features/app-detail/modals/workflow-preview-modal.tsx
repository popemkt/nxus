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
      <AlertDialogContent className="sm:max-w-6xl max-h-[95vh] flex flex-col p-4 gap-3">
        <AlertDialogHeader className="pb-0">
          <div className="flex items-center gap-2">
            <FlowArrow className="h-5 w-5 text-primary" />
            <AlertDialogTitle className="font-mono text-sm">
              {commandName}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs">
            {stepCount} step{stepCount !== 1 ? 's' : ''}
            {workflow.description && ` · ${workflow.description}`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div
          className="overflow-hidden rounded-md border bg-muted/20"
          style={{ width: '100%', height: '65vh', minHeight: '450px' }}
        >
          <WorkflowGraphCanvas
            workflow={workflow}
            className="w-full h-full"
            showLegend
            showMinimap={false}
            showControls
          />
        </div>

        <AlertDialogFooter className="pt-0">
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
