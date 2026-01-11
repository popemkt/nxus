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

interface AppDetailTagsProps {
  appId: string
  appName: string
  tags: string[]
}

export function AppDetailTags({ appId, appName, tags }: AppDetailTagsProps) {
  const queryClient = useQueryClient()
  const [configModalTag, setConfigModalTag] = React.useState<string | null>(
    null,
  )

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

  // Compute which tags are configurable and which are configured
  const configurableTags = React.useMemo(() => {
    const result = configurableTagsResult as
      | { success: boolean; data?: Array<{ tagId: string }> }
      | undefined
    if (!result?.success || !result.data) return new Set<string>()
    return new Set(result.data.map((t) => t.tagId))
  }, [configurableTagsResult])

  const configuredTags = React.useMemo(() => {
    const result = appTagValuesResult as
      | { success: boolean; data?: Array<{ tagId: string }> }
      | undefined
    if (!result?.success || !result.data) return new Set<string>()
    return new Set(result.data.map((v) => v.tagId))
  }, [appTagValuesResult])

  if (tags.length === 0) return null

  return (
    <>
      {tags.map((tag) => (
        <ConfigurableTag
          key={tag}
          tagId={tag}
          appId={appId}
          isConfigurable={configurableTags.has(tag)}
          isConfigured={configuredTags.has(tag)}
          onConfigure={() => setConfigModalTag(tag)}
          showConfigButton={configurableTags.has(tag)}
        />
      ))}

      {/* Config modal for configuring a tag */}
      {configModalTag && (
        <TagConfigModal
          tagId={configModalTag}
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
