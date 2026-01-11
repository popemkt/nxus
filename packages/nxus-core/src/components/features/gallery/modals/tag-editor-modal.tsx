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
  const [tagSlugs, setTagSlugs] = React.useState<string[]>([])
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
      setTagSlugs(app.metadata.tags ?? [])
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

  // Get current tags as objects
  const getTagBySlug = useTagDataStore((s) => s.getTagBySlug)
  const currentTags = React.useMemo(() => {
    return tagSlugs.map((slug) => getTagBySlug(slug)).filter(Boolean) as Array<{
      id: number
      name: string
      slug: string
    }>
  }, [tagSlugs, getTagBySlug])

  // Filter suggestions based on input
  const suggestions = React.useMemo(() => {
    if (!inputValue.trim()) return []

    const query = inputValue.toLowerCase()
    const matches = allExistingTags
      .filter(
        (tag) =>
          (tag.name.toLowerCase().includes(query) ||
            tag.slug.toLowerCase().includes(query)) &&
          !tagSlugs.includes(tag.slug),
      )
      .slice(0, 8)

    // Add "create new" option if input doesn't match any existing tag name or slug
    const exactMatch = allExistingTags.some(
      (t) => t.name.toLowerCase() === query || t.slug.toLowerCase() === query,
    )
    if (
      !exactMatch &&
      inputValue.trim() &&
      !tagSlugs.includes(inputValue.trim().toLowerCase())
    ) {
      matches.push({
        id: -1,
        slug: `__create__:${inputValue.trim()}`,
        name: inputValue.trim(),
      } as any)
    }

    return matches
  }, [inputValue, allExistingTags, tagSlugs])

  const handleAddTag = (suggestion: any) => {
    // Determine if it's an existing tag object or a "create" object
    const isCreate = suggestion.slug?.startsWith('__create__:')
    const slug = isCreate
      ? suggestion.slug
          .replace('__create__:', '')
          .toLowerCase()
          .replace(/\s+/g, '-')
      : suggestion.slug

    if (slug && !tagSlugs.includes(slug)) {
      setTagSlugs([...tagSlugs, slug])
    }
    setInputValue('')
    setShowSuggestions(false)
    setSelectedIndex(0)
    inputRef.current?.focus()
  }

  const handleRemoveTag = (slug: string) => {
    setTagSlugs(tagSlugs.filter((s) => s !== slug))
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
        const slug = inputValue.trim().toLowerCase().replace(/\s+/g, '-')
        handleAddTag({ slug, name: inputValue.trim() })
      }
    } else if (e.key === 'Backspace' && !inputValue && tagSlugs.length > 0) {
      // Remove last tag on backspace when input is empty
      handleRemoveTag(tagSlugs[tagSlugs.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleSave = () => {
    saveMutation.mutate(tagSlugs)
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
            <div className="flex flex-wrap gap-2 p-3 min-h-[60px] bg-muted/50 rounded-md border">
              {currentTags.map((tag) => (
                <ConfigurableTag
                  key={tag.id}
                  tagId={tag.name}
                  appId={app.id}
                  isConfigurable={configurableTagIds.has(tag.id)}
                  isConfigured={configuredTagIds.has(tag.id)}
                  onConfigure={() =>
                    setConfigModalTag({ id: tag.id, name: tag.name })
                  }
                  onRemove={() => handleRemoveTag(tag.slug)}
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
                  className="border-0 bg-transparent focus-visible:ring-0 px-0 h-8"
                />

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion: any, index) => {
                      const isCreate =
                        suggestion.slug?.startsWith('__create__:')
                      const displayText = isCreate
                        ? suggestion.name
                        : suggestion.name

                      return (
                        <button
                          key={suggestion.slug}
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
