/**
 * AppDetailTags Component
 *
 * Renders tags for the app detail page with configurable tag support.
 * Shows warning icons for unconfigured tags and gear buttons for configuration.
 */

import * as React from 'react'
import { ConfigurableTag } from '@/components/shared/configurable-tag'
import { TagConfigModal } from '@/components/shared/tag-config-modal'
import {
  getAllConfigurableTagsServerFn,
  getAllAppTagValuesServerFn,
} from '@/services/tag-config.server'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TagRef } from '@/types/app'

interface AppDetailTagsProps {
  appId: string
  appName: string
  tags: TagRef[] // Now receives {id, name}[] directly
}

export function AppDetailTags({ appId, appName, tags }: AppDetailTagsProps) {
  const queryClient = useQueryClient()
  const [configModalTag, setConfigModalTag] = React.useState<{
    id: number
    name: string
  } | null>(null)

  // Fetch all configurable tags
  const { data: configurableTagsResult } = useQuery({
    queryKey: ['configurable-tags'],
    queryFn: () => getAllConfigurableTagsServerFn(),
  })

  // Fetch this app's configured tag values
  const { data: appTagValuesResult } = useQuery({
    queryKey: ['app-tag-values', appId],
    queryFn: () => getAllAppTagValuesServerFn({ data: { appId } }),
  })

  // Compute which tags are configurable and which are configured (numeric IDs)
  const configurableTagIds = React.useMemo(() => {
    const result = configurableTagsResult as
      | { success: boolean; data?: Array<{ tagId: number }> }
      | undefined
    if (!result?.success || !result.data) return new Set<number>()
    return new Set(result.data.map((t) => t.tagId))
  }, [configurableTagsResult])

  const configuredTagIds = React.useMemo(() => {
    const result = appTagValuesResult as
      | { success: boolean; data?: Array<{ tagId: number }> }
      | undefined
    if (!result?.success || !result.data) return new Set<number>()
    return new Set(result.data.map((v) => v.tagId))
  }, [appTagValuesResult])

  if (!tags || tags.length === 0) return null

  return (
    <>
      {tags.map((tag) => (
        <ConfigurableTag
          key={tag.id}
          tagId={tag.name} // Display the name
          appId={appId}
          isConfigurable={configurableTagIds.has(tag.id)}
          isConfigured={configuredTagIds.has(tag.id)}
          onConfigure={() => setConfigModalTag({ id: tag.id, name: tag.name })}
          showConfigButton={configurableTagIds.has(tag.id)}
        />
      ))}

      {/* Config modal for configuring a tag */}
      {configModalTag && (
        <TagConfigModal
          tagId={configModalTag.id}
          tagName={configModalTag.name}
          appId={appId}
          appName={appName}
          open={!!configModalTag}
          onOpenChange={(open) => !open && setConfigModalTag(null)}
          onSave={() => {
            queryClient.invalidateQueries({
              queryKey: ['app-tag-values', appId],
            })
          }}
        />
      )}
    </>
  )
}
