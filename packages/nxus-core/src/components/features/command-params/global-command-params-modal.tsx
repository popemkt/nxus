/**
 * Global Command Params Modal
 *
 * Uses the store to render the modal. Mount this in the app root.
 */

import { CommandParamsModal } from '@/components/features/command-params/command-params-modal'
import { useCommandParamsModalStore } from '@/stores/command-params-modal.store'

export function GlobalCommandParamsModal() {
  const {
    isOpen,
    title,
    description,
    requirements,
    params,
    onComplete,
    close,
  } = useCommandParamsModalStore()

  return (
    <CommandParamsModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      title={title}
      description={description}
      requirements={requirements}
      params={params}
      onRun={(result) => {
        onComplete?.(result)
        close()
      }}
    />
  )
}
