/**
 * Client-side inline mention token grammar: `[[node:<uuid>]]`.
 *
 * Mirrors `INLINE_MENTION_TOKEN_PATTERN` in
 * `libs/nxus-db/src/services/node.service.ts` — kept as a separate constant
 * (not imported) because that module pulls in server-only dependencies
 * (better-sqlite3) that must never reach the client bundle, the same
 * client/server duplication precedent as `FieldType` in `types/outline.ts`.
 *
 * Spec: spec/product/editor.md §References, spec/product/data-model.md §3.
 */
const INLINE_MENTION_TOKEN_PATTERN =
  /\[\[node:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g

export interface ContentSegment {
  type: 'text' | 'mention'
  text: string
  nodeId?: string
}

/**
 * Split node content into alternating text/mention segments for read-view
 * rendering. Active (contenteditable) editing renders the raw token text
 * instead — this is WYSIWYG-lite by design, not a rich text editor.
 */
export function splitContentIntoMentionSegments(content: string): ContentSegment[] {
  if (!content) return []
  const segments: ContentSegment[] = []
  let lastIndex = 0

  for (const match of content.matchAll(INLINE_MENTION_TOKEN_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, index) })
    }
    const nodeId = match[1]
    segments.push({ type: 'mention', text: match[0], nodeId })
    lastIndex = index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) })
  }

  return segments
}

/** Quick check used to skip segment-splitting for the common no-mention case. */
export function hasInlineMentionToken(content: string): boolean {
  return /\[\[node:[0-9a-fA-F-]{36}\]\]/.test(content)
}
