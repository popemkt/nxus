import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from 'react-resizable-panels'

import { cn } from '../lib/utils'

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle = false,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0 [&[data-orientation=vertical]>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 6 16"
            fill="currentColor"
            className="size-2.5"
          >
            <path d="M1 0a1 1 0 0 0 0 2h0a1 1 0 0 0 0-2h0zm0 7a1 1 0 0 0 0 2h0a1 1 0 0 0 0-2h0zm0 7a1 1 0 0 0 0 2h0a1 1 0 0 0 0-2h0zm4-14a1 1 0 0 0 0 2h0a1 1 0 0 0 0-2h0zm0 7a1 1 0 0 0 0 2h0a1 1 0 0 0 0-2h0zm0 7a1 1 0 0 0 0 2h0a1 1 0 0 0 0-2h0z" />
          </svg>
        </div>
      )}
    </Separator>
  )
}

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  type GroupProps as ResizablePanelGroupProps,
  type PanelProps as ResizablePanelProps,
  type SeparatorProps as ResizableHandleProps,
}
