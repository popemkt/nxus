import * as React from 'react'
import Markdown from 'react-markdown'
import { getDocContentServerFn } from '@/services/apps/docs.server'
import { CommandButton } from '@/components/app/command-button'
import type { App, AppCommand } from '@/types/app'

interface DocViewerProps {
  appId: string
  fileName: string
  app: App
  onExecuteCommand?: (command: string) => void
}

/**
 * Renders a markdown documentation file with embedded command buttons
 *
 * Supports special syntax: {{command:command-id}}
 * This will render a CommandButton for the matching command from the app's commands array
 */
export function DocViewer({
  appId,
  fileName,
  app,
  onExecuteCommand,
}: DocViewerProps) {
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function loadDoc() {
      setLoading(true)
      setError(null)

      try {
        const result = await getDocContentServerFn({
          data: { appId, fileName },
        })
        if (cancelled) return

        if (result.success) {
          setContent(result.content)
        } else {
          setError(result.error)
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDoc()
    return () => {
      cancelled = true
    }
  }, [appId, fileName])

  // Build a map of commands by ID for quick lookup
  const commandsById = React.useMemo(() => {
    const map = new Map<string, AppCommand>()
    app.commands?.forEach((cmd) => map.set(cmd.id, cmd))
    return map
  }, [app.commands])

  // Process content to replace {{command:id}} with placeholders
  // and render them as CommandButton components
  const processedContent = React.useMemo(() => {
    if (!content) return null

    // Split content by command syntax
    const parts = content.split(/(\{\{command:[\w-]+\}\})/g)

    return parts.map((part, index) => {
      const match = part.match(/^\{\{command:([\w-]+)\}\}$/)
      if (match) {
        const commandId = match[1]
        const command = commandsById.get(commandId)

        if (command) {
          return (
            <span key={index} className="inline-block my-1">
              <CommandButton
                command={command}
                app={app}
                compact
                onExecute={onExecuteCommand}
              />
            </span>
          )
        }

        // Command not found - show placeholder
        return (
          <span
            key={index}
            className="inline-block px-2 py-1 text-xs bg-destructive/10 text-destructive rounded"
          >
            Unknown command: {commandId}
          </span>
        )
      }

      // Regular markdown content
      return (
        <Markdown
          key={index}
          components={{
            // Custom styling for markdown elements
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold mt-6 mb-4 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-semibold mt-5 mb-3">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-medium mt-4 mb-2">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="mb-3 leading-relaxed">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside mb-3 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside mb-3 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="ml-2">{children}</li>,
            code: ({ className, children }) => {
              const isInline = !className
              if (isInline) {
                return (
                  <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
                    {children}
                  </code>
                )
              }
              return (
                <code className="block p-3 rounded-md bg-muted font-mono text-sm overflow-x-auto mb-3">
                  {children}
                </code>
              )
            },
            pre: ({ children }) => (
              <pre className="mb-3 overflow-x-auto">{children}</pre>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground mb-3">
                {children}
              </blockquote>
            ),
          }}
        >
          {part}
        </Markdown>
      )
    })
  }, [content, commandsById, app, onExecuteCommand])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading documentation...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-md bg-destructive/10 text-destructive">
        <p className="font-medium">Failed to load documentation</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="p-4 text-muted-foreground text-center">
        No documentation available
      </div>
    )
  }

  return <div className="max-w-none text-foreground">{processedContent}</div>
}
