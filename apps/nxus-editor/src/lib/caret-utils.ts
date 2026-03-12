/**
 * Get the bounding rectangle of the current caret position.
 * Uses the Range API to measure caret position within contentEditable elements.
 */
export function getCaretRect(): { top: number; left: number; height: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0).cloneRange()
  range.collapse(true)

  // Insert a zero-width space to measure position
  const span = document.createElement('span')
  span.textContent = '\u200B'
  range.insertNode(span)

  const rect = span.getBoundingClientRect()
  const result = { top: rect.top, left: rect.left, height: rect.height }

  // Clean up
  span.parentNode?.removeChild(span)
  // Restore selection
  sel.removeAllRanges()
  sel.addRange(range)

  return result
}
