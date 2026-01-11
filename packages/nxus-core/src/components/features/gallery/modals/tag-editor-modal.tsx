/**
 * TagEditorModal Component
 *
 * Modal for editing tags on an app. Features:
 * - Autocomplete from existing tags
 * - Configurable tag awareness (shows warning for unconfigured)
 * - Create new tags on the fly
 * - Keyboard navigation
 */

import * as React from 'react'
import { Tag, Plus, MagnifyingGlass } from '@phosphor-icons/react'
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
import { Input } from '@/components/ui/input'
import { ConfigurableTag } from '@/components/shared/configurable-tag'
import { TagConfigModal } from '@/components/shared/tag-config-modal'
import { updateAppTagsServerFn } from '@/services/apps/apps-mutations.server'
import {
  getAllConfigurableTagsServerFn,
  getAllAppTagValuesServerFn,
} from '@/services/tag-config.server'
import { useTagDataStore } from '@/stores/tag-data.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { App } from '@/types/app'

export interface TagEditorModalProps {
  app: App
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: () => void
}

export function TagEditorModal({
  app,
  open,
  onOpenChange,
  onSave,
}: TagEditorModalProps) {
  const queryClient = useQueryClient()
  const { getAllTags } = useTagDataStore()

  // Local state
  const [tags, setTags] = React.useState<string[]>([])
  const [inputValue, setInputValue] = React.useState('')
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [configModalTag, setConfigModalTag] = React.useState<string | null>(
    null,
  )

  const inputRef = React.useRef<HTMLInputElement>(null)

  // Fetch configurable tags (tags with schemas)
  const { data: configurableTagsResult } = useQuery({
    queryKey: ['configurable-tags'],
    queryFn: () => getAllConfigurableTagsServerFn(),
    enabled: open,
  })

  // Fetch this app's configured tag values
  const { data: appTagValuesResult } = useQuery({
    queryKey: ['app-tag-values', app.id],
    queryFn: () => getAllAppTagValuesServerFn({ data: { appId: app.id } }),
    enabled: open,
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (newTags: string[]) =>
      updateAppTagsServerFn({ data: { appId: app.id, tags: newTags } }),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['apps'] })
        onOpenChange(false)
        onSave?.()
      }
    },
  })

  // Initialize tags from app
  React.useEffect(() => {
    if (open) {
      setTags(app.metadata.tags ?? [])
      setInputValue('')
      setShowSuggestions(false)
    }
  }, [open, app.metadata.tags])

  // Get all existing tags for suggestions
  const allExistingTags = React.useMemo(() => {
    const tagSet = new Set<string>()
    getAllTags().forEach((t) => tagSet.add(t.name))
    return Array.from(tagSet)
  }, [getAllTags])

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

  // Filter suggestions based on input
  const suggestions = React.useMemo(() => {
    if (!inputValue.trim()) return []

    const query = inputValue.toLowerCase()
    const matches = allExistingTags
      .filter((tag) => tag.toLowerCase().includes(query) && !tags.includes(tag))
      .slice(0, 8)

    // Add "create new" option if input doesn't match any existing tag
    const exactMatch = allExistingTags.some((t) => t.toLowerCase() === query)
    if (!exactMatch && inputValue.trim() && !tags.includes(inputValue.trim())) {
      matches.push(`__create__:${inputValue.trim()}`)
    }

    return matches
  }, [inputValue, allExistingTags, tags])

  const handleAddTag = (tag: string) => {
    // Handle "create new" special case
    const actualTag = tag.startsWith('__create__:')
      ? tag.replace('__create__:', '')
      : tag

    if (actualTag && !tags.includes(actualTag)) {
      setTags([...tags, actualTag])
    }
    setInputValue('')
    setShowSuggestions(false)
    setSelectedIndex(0)
    inputRef.current?.focus()
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) {
        handleAddTag(suggestions[selectedIndex])
      } else if (inputValue.trim()) {
        handleAddTag(inputValue.trim())
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      handleRemoveTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleSave = () => {
    saveMutation.mutate(tags)
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <AlertDialogTitle>Edit Tags — {app.name}</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Add or remove tags for this item. Tags with ⚠ need configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            {/* Tags container */}
            <div className="flex flex-wrap gap-2 p-3 min-h-[60px] bg-muted/50 rounded-md border">
              {tags.map((tag) => (
                <ConfigurableTag
                  key={tag}
                  tagId={tag}
                  appId={app.id}
                  isConfigurable={configurableTags.has(tag)}
                  isConfigured={configuredTags.has(tag)}
                  onConfigure={() => setConfigModalTag(tag)}
                  onRemove={() => handleRemoveTag(tag)}
                  showConfigButton={configurableTags.has(tag)}
                />
              ))}

              {/* Input field */}
              <div className="relative flex-1 min-w-[150px]">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value)
                    setShowSuggestions(true)
                    setSelectedIndex(0)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Add tag..."
                  className="border-0 bg-transparent focus-visible:ring-0 px-0 h-8"
                />

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion, index) => {
                      const isCreate = suggestion.startsWith('__create__:')
                      const displayText = isCreate
                        ? suggestion.replace('__create__:', '')
                        : suggestion

                      return (
                        <button
                          key={suggestion}
                          type="button"
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                            index === selectedIndex && 'bg-accent',
                          )}
                          onClick={() => handleAddTag(suggestion)}
                          onMouseEnter={() => setSelectedIndex(index)}
                        >
                          <span className="flex items-center gap-2">
                            {isCreate ? (
                              <>
                                <Plus className="h-3 w-3" />
                                Create "{displayText}"
                              </>
                            ) : (
                              <>
                                <MagnifyingGlass className="h-3 w-3 text-muted-foreground" />
                                {displayText}
                              </>
                            )}
                          </span>
                          {configurableTags.has(displayText) && (
                            <span className="text-xs text-amber-500">
                              configurable
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              Type to search existing tags or create new ones. Press Enter to
              add.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Tags'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Config modal for configuring a tag */}
      {configModalTag && (
        <TagConfigModal
          tagId={configModalTag}
          appId={app.id}
          appName={app.name}
          open={!!configModalTag}
          onOpenChange={(open) => !open && setConfigModalTag(null)}
          onSave={() => {
            queryClient.invalidateQueries({
              queryKey: ['app-tag-values', app.id],
            })
          }}
        />
      )}
    </>
  )
}
