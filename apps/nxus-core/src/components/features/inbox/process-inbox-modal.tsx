/**
 * ProcessInboxModal Component
 *
 * Modal for selecting an AI provider to process an inbox item.
 * Launches the add-item workflow with the selected provider.
 */

import * as React from 'react'
import { Play, Robot, Warning } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle, Badge , Button , cn 
} from '@nxus/ui'
import { useQuery } from '@tanstack/react-query'
import type { Item } from '@nxus/db'
import type {InboxItem} from '@/services/inbox/inbox.server';
import { getAppsByConfiguredTagServerFn } from '@/services/tag-config.server'
import { getAllAppsServerFn } from '@/services/apps/apps.server'
import {
  
  updateInboxItemServerFn
} from '@/services/inbox/inbox.server'
import { commandExecutor } from '@/services/command-palette/executor'
import { useTerminalStore } from '@/stores/terminal.store'
import { SYSTEM_TAGS } from '@/lib/system-tags'
import { checkToolHealth } from '@/services/tool-health/tool-health.server'
import { usePath } from '@/hooks/use-paths'

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

  // Get the nxus core root path from server
  const nxusCoreRoot = usePath('nxusCoreRoot')

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
        return { providers: [] as Array<AIProvider> }
      }

      const appsMap = new Map<string, Item>(
        appsResult.apps.map((app) => [app.id, app]),
      )

      // Check health for each provider in parallel
      const providerChecks = await Promise.all(
        tagValues.data.map(
          async (tv: {
            appId: string
            values: Record<string, unknown>
          }): Promise<AIProvider | null> => {
            const app = appsMap.get(tv.appId)
            if (!app) return null

            const values = tv.values as { cliCommand?: string }
            if (!values.cliCommand) return null

            // Get checkCommand if tool has one
            const checkCommand =
              app.types?.includes('tool') && 'checkCommand' in app
                ? (app as any).checkCommand
                : undefined

            // Dynamically check installation status using tool health
            let isInstalled = false
            if (checkCommand) {
              try {
                const healthResult = await checkToolHealth({
                  data: { checkCommand },
                })
                isInstalled = healthResult.isInstalled
              } catch (error) {
                console.warn(`Health check failed for ${app.name}:`, error)
                // Fall back to app.status if health check fails
                isInstalled = app.status === 'installed'
              }
            } else {
              // No health check available, use static status
              isInstalled = app.status === 'installed'
            }

            return {
              appId: app.id,
              appName: app.name,
              cliCommand: values.cliCommand,
              isInstalled,
              checkCommand,
            }
          },
        ),
      )

      const providers = providerChecks.filter(
        (p): p is AIProvider => p !== null,
      )
      return { providers }
    },
    enabled: open,
  })

  const providers = providersResult?.providers ?? []

  // Set default selection to first provider (or claude-code if available)
  React.useEffect(() => {
    if (open && providers.length > 0 && !selectedProvider) {
      const claude = providers.find((p) => p.appId === 'claude-code')
      const firstProvider = providers[0]
      setSelectedProvider(claude?.appId ?? firstProvider?.appId ?? null)
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
    if (!selectedProvider || !nxusCoreRoot) return

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
        cwd: nxusCoreRoot,
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
