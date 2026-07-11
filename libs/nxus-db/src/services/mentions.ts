/**
 * Inline mention token grammar: `[[node:<uuid>]]`.
 * Surreal graph-mode node record IDs (`node:<id>`) are also accepted as the
 * token payload, which renders as `[[node:node:<id>]]`.
 */
const INLINE_MENTION_TOKEN_PATTERN =
  /\[\[node:((?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})|(?:node:[A-Za-z0-9_-]+))\]\]/g

/**
 * Extract the set of node ids referenced via `[[node:<id>]]` tokens in
 * `content`, deduplicated, in first-occurrence order.
 */
export function extractMentionedNodeIds(content: string | null | undefined): string[] {
  if (!content) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of content.matchAll(INLINE_MENTION_TOKEN_PATTERN)) {
    const id = match[1]
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}
