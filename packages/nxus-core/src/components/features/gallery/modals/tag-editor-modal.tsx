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
import type { Item, TagRef } from '@/types/item'

export interface TagEditorModalProps {
  app: Item
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

  // Local state - now using TagRef[] instead of string[] slugs
  const [selectedTags, setSelectedTags] = React.useState<TagRef[]>([])
  const [inputValue, setInputValue] = React.useState('')
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [configModalTag, setConfigModalTag] = React.useState<{
    id: number
    name: string
  } | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)

  // Fetch configurable tags (numeric IDs)
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

  // Save mutation - now sends TagRef[]
  const saveMutation = useMutation({
    mutationFn: (newTags: TagRef[]) =>
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
      setSelectedTags(app.metadata.tags ?? [])
      setInputValue('')
      setShowSuggestions(false)
    }
  }, [open, app.metadata.tags])

  // Get all existing tags for suggestions (use Tag objects)
  const allTags = useTagDataStore((s) => s.tags)
  const allExistingTags = React.useMemo(() => {
    return Array.from(allTags.values())
  }, [allTags])

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

  // Get IDs of currently selected tags for filtering
  const selectedTagIds = React.useMemo(() => {
    return new Set(selectedTags.map((t) => t.id))
  }, [selectedTags])

  // Filter suggestions based on input
  const suggestions = React.useMemo(() => {
    if (!inputValue.trim()) return []

    const query = inputValue.toLowerCase()
    const matches = allExistingTags
      .filter(
        (tag) =>
          tag.name.toLowerCase().includes(query) && !selectedTagIds.has(tag.id),
      )
      .slice(0, 8)
      .map((tag) => ({ id: tag.id, name: tag.name }))

    // Add "create new" option if input doesn't match any existing tag name
    const exactMatch = allExistingTags.some(
      (t) => t.name.toLowerCase() === query,
    )
    if (
      !exactMatch &&
      inputValue.trim() &&
      !selectedTags.some((t) => t.name.toLowerCase() === query)
    ) {
      matches.push({
        id: -1, // Marker for "create new"
        name: inputValue.trim(),
      })
    }

    return matches
  }, [inputValue, allExistingTags, selectedTagIds, selectedTags])

  const handleAddTag = (suggestion: TagRef) => {
    if (suggestion.id === -1) {
      // Creating a new tag - for now just add with temp ID
      // The server will create the tag if it doesn't exist
      // TODO: Consider creating tag on server first
      const newTag = { id: Date.now(), name: suggestion.name }
      setSelectedTags([...selectedTags, newTag])
    } else {
      // Existing tag
      if (!selectedTagIds.has(suggestion.id)) {
        setSelectedTags([...selectedTags, suggestion])
      }
    }
    setInputValue('')
    setShowSuggestions(false)
    setSelectedIndex(0)
    inputRef.current?.focus()
  }

  const handleRemoveTag = (tagId: number) => {
    setSelectedTags(selectedTags.filter((t) => t.id !== tagId))
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
        // Create new tag on Enter
        handleAddTag({ id: -1, name: inputValue.trim() })
      }
    } else if (
      e.key === 'Backspace' &&
      !inputValue &&
      selectedTags.length > 0
    ) {
      // Remove last tag on backspace
      handleRemoveTag(selectedTags[selectedTags.length - 1].id)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleSave = () => {
    saveMutation.mutate(selectedTags)
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
              Add or remove tags for this item. Tags with ⚡ are configurable.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            {/* Tags container */}
            <div className="flex flex-wrap items-center gap-2 p-3 min-h-[60px] bg-muted/50 rounded-md border">
              {selectedTags.map((tag) => (
                <ConfigurableTag
                  key={tag.id}
                  tagId={tag.name}
                  appId={app.id}
                  isConfigurable={configurableTagIds.has(tag.id)}
                  isConfigured={configuredTagIds.has(tag.id)}
                  onConfigure={() =>
                    setConfigModalTag({ id: tag.id, name: tag.name })
                  }
                  onRemove={() => handleRemoveTag(tag.id)}
                  showConfigButton={configurableTagIds.has(tag.id)}
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
                  className="border-0 bg-transparent focus-visible:ring-0 px-0 h-7 text-sm"
                />

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion, index) => {
                      const isCreate = suggestion.id === -1

                      return (
                        <button
                          key={suggestion.id}
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
                                Create "{suggestion.name}"
                              </>
                            ) : (
                              <>
                                <MagnifyingGlass className="h-3 w-3 text-muted-foreground" />
                                {suggestion.name}
                              </>
                            )}
                          </span>
                          {!isCreate &&
                            configurableTagIds.has(suggestion.id) && (
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
          tagId={configModalTag.id}
          tagName={configModalTag.name}
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
