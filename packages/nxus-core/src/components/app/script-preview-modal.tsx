import * as React from 'react'
import { CodeIcon, CopyIcon, CheckIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { readScriptFileServerFn } from '@/services/shell/read-script.server'

interface ScriptPreviewModalProps {
  appId: string
  scriptPath: string // Relative path like "install.ps1" OR inline command for execute mode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If true, scriptPath is an inline command to display directly (not a file to read) */
  isInlineCommand?: boolean
}

/**
 * Modal to preview script content or inline command before execution
 */
export function ScriptPreviewModal({
  appId,
  scriptPath,
  open,
  onOpenChange,
  isInlineCommand = false,
}: ScriptPreviewModalProps) {
  const [content, setContent] = React.useState<string>('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  // Extract filename from path (or use "command" for inline)
  const fileName = React.useMemo(() => {
    if (isInlineCommand) return 'Command'
    const parts = scriptPath.split('/')
    return parts[parts.length - 1] || 'script'
  }, [scriptPath, isInlineCommand])

  // Load script content when modal opens (or set inline command directly)
  React.useEffect(() => {
    if (!open) return

    // For inline commands, just display the command directly
    if (isInlineCommand) {
      setContent(scriptPath)
      setLoading(false)
      setError(null)
      return
    }

    // For script files, read from disk
    setLoading(true)
    setError(null)
    setContent('')

    readScriptFileServerFn({ data: { appId, scriptPath } })
      .then((result) => {
        if (result.success) {
          setContent(result.content)
        } else {
          setError(result.error)
        }
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [open, appId, scriptPath, isInlineCommand])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <CodeIcon className="h-5 w-5 text-primary" />
            <AlertDialogTitle className="font-mono text-sm">
              {fileName}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {isInlineCommand
              ? 'Review the command that will be executed.'
              : 'Review the script content before running.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex-1 overflow-auto rounded-md border bg-muted/50 p-4 min-h-[200px] max-h-[400px]">
          {loading && (
            <div className="text-muted-foreground text-sm">Loading...</div>
          )}
          {error && <div className="text-destructive text-sm">{error}</div>}
          {!loading && !error && (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              <code>{content}</code>
            </pre>
          )}
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={loading || !!error}
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4 mr-1" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4 mr-1" />
                Copy
              </>
            )}
          </Button>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
