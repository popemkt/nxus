export const INITIAL_TREE_DEPTH = 3
export const SUBTREE_FETCH_DEPTH = 3

// Wide sibling lists switch from recursive full rendering to scroll-windowed
// rendering above this count. Lists at or below the threshold keep the current
// DOM shape so normal outlines and selector-based tests are unchanged.
export const VIRTUALIZE_CHILDREN_THRESHOLD = 150
