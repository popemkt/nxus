/**
 * ProcessInboxModal Component
 *
 * Modal for selecting an AI provider to process an inbox item.
 * Launches the add-item workflow with the selected provider.
 */

import * as React from 'react'
import { Robot, Play, Warning } from '@phosphor-icons/react'
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
import { Badge } from '@/components/ui/badge'
import { getAppsByConfiguredTagServerFn } from '@/services/tag-config.server'
import { getAllAppsServerFn } from '@/services/apps/apps.server'
import {
  updateInboxItemServerFn,
  type InboxItem,
} from '@/services/inbox/inbox.server'
import { commandExecutor } from '@/services/command-palette/executor'
import { useTerminalStore } from '@/stores/terminal.store'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { SYSTEM_TAGS } from '@/lib/system-tags'
import type { App } from '@/types/app'

export interface ProcessInboxModalProps {
  item: InboxItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart?: () => void
}

interface AIProvider {
  appId: string
  appName: string
  cliCommand: string
  isInstalled: boolean
  checkCommand?: string
}

export function ProcessInboxModal({
  item,
  open,
  onOpenChange,
  onStart,
}: ProcessInboxModalProps) {
  const terminalStore = useTerminalStore()
  const [selectedProvider, setSelectedProvider] = React.useState<string | null>(
    null,
  )
  const [isLaunching, setIsLaunching] = React.useState(false)

  // Fetch apps with AI Provider tag configured
  const { data: providersResult, isLoading: isLoadingProviders } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const [tagValuesResult, appsResult] = await Promise.all([
        getAppsByConfiguredTagServerFn({
          data: { tagId: SYSTEM_TAGS.AI_PROVIDER.id },
        }),
        getAllAppsServerFn(),
      ])

      const tagValues = tagValuesResult as {
        success: boolean
        data?: Array<{ appId: string; values: Record<string, unknown> }>
      }

      if (!tagValues.success || !tagValues.data || !appsResult.success) {
        return { providers: [] as AIProvider[] }
      }

      const appsMap = new Map<string, App>(
        appsResult.apps.map((app) => [app.id, app]),
      )

      const providers: AIProvider[] = tagValues.data
        .map((tv: { appId: string; values: Record<string, unknown> }) => {
          const app = appsMap.get(tv.appId)
          if (!app) return null

          const values = tv.values as { cliCommand?: string }
          if (!values.cliCommand) return null

          // Check if tool has a checkCommand and determine installation dynamically
          const checkCommand =
            app.type === 'tool' && 'checkCommand' in app
              ? (app as any).checkCommand
              : undefined

          // Use the cliCommand as a proxy for installation check if no checkCommand
          // Tools with cliCommand configured are likely installed
          const isInstalled = app.status === 'installed' || !!checkCommand

          return {
            appId: app.id,
            appName: app.name,
            cliCommand: values.cliCommand,
            isInstalled,
            checkCommand, // Store for dynamic health check
          }
        })
        .filter((p): p is AIProvider => p !== null)

      return { providers }
    },
    enabled: open,
  })

  const providers = providersResult?.providers ?? []

  // Set default selection to first provider (or claude-code if available)
  React.useEffect(() => {
    if (open && providers.length > 0 && !selectedProvider) {
      const claude = providers.find((p) => p.appId === 'claude-code')
      setSelectedProvider(claude?.appId ?? providers[0].appId)
    }
  }, [open, providers, selectedProvider])

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setSelectedProvider(null)
      setIsLaunching(false)
    }
  }, [open])

  const handleStart = async () => {
    if (!selectedProvider) return

    const provider = providers.find((p) => p.appId === selectedProvider)
    if (!provider) return

    setIsLaunching(true)

    try {
      // Build prompt for AI
      const prompt = `I want to add this item to the Nxus registry.

## Item Details
Title: ${item.title}
${item.notes ? `Notes: ${item.notes}` : ''}

## Instructions
Follow the workflow: /update-add-item`

      // Launch interactive terminal with AI CLI
      await commandExecutor.executeInteractive({
        command: `${provider.cliCommand} "${prompt.replace(/"/g, '\\"')}"`,
        cwd: '/stuff/WorkSpace/Nxus/nxus',
        tabName: `Add: ${item.title}`,
        terminalStore,
      })

      // Mark item as processing
      await updateInboxItemServerFn({
        data: { id: item.id, status: 'processing' },
      })

      onStart?.()
      onOpenChange(false)
    } catch (error) {
      console.error('[ProcessInboxModal] Failed to launch:', error)
    } finally {
      setIsLaunching(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Robot className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Process with AI</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Select an AI provider to run the add-item workflow.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          {/* Item preview */}
          <div className="p-3 bg-muted/50 rounded-md mb-4">
            <p className="font-medium">{item.title}</p>
            {item.notes && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {item.notes}
              </p>
            )}
          </div>

          {/* Provider selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Select AI Provider</p>

            {isLoadingProviders ? (
              <div className="text-center py-4 text-muted-foreground">
                Loading providers...
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-4">
                <Warning className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No AI providers configured.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add the "ai-provider" tag to an app and configure it.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <button
                    key={provider.appId}
                    type="button"
                    onClick={() => setSelectedProvider(provider.appId)}
                    className={cn(
                      'w-full p-3 rounded-md border text-left transition-colors',
                      selectedProvider === provider.appId
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{provider.appName}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {provider.cliCommand}
                        </p>
                      </div>
                      {provider.isInstalled ? (
                        <Badge variant="outline" className="text-xs">
                          Installed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Not Installed
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLaunching}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleStart}
            disabled={
              !selectedProvider || isLaunching || providers.length === 0
            }
          >
            {isLaunching ? (
              'Launching...'
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Start Workflow
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
