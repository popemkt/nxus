/**
 * Bloom's taxonomy progression logic for spaced repetition.
 *
 * After each review, the learner's currentBloomsLevel can:
 * - Bump up on "good" or "easy" (capped at the concept's ceiling)
 * - Stay on "hard"
 * - Drop back one on "again"
 */

const BLOOMS_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const
export type BloomsLevel = (typeof BLOOMS_ORDER)[number]

/**
 * Compute the next Bloom's level after a review rating.
 *
 * @param current - The learner's current Bloom's level for this concept
 * @param ceiling - The concept's target Bloom's level (max they can reach)
 * @param rating  - FSRS rating: 1=again, 2=hard, 3=good, 4=easy
 */
export function nextBloomsLevel(
  current: BloomsLevel,
  ceiling: BloomsLevel,
  rating: 1 | 2 | 3 | 4,
): BloomsLevel {
  const currentIdx = BLOOMS_ORDER.indexOf(current)
  const ceilingIdx = BLOOMS_ORDER.indexOf(ceiling)

  if (rating === 1) {
    // Again → drop one level (min: remember)
    return BLOOMS_ORDER[Math.max(0, currentIdx - 1)]!
  }

  if (rating === 2) {
    // Hard → stay
    return current
  }

  // Good or Easy → bump up one level (capped at ceiling)
  const nextIdx = Math.min(currentIdx + 1, ceilingIdx)
  return BLOOMS_ORDER[nextIdx]!
}
