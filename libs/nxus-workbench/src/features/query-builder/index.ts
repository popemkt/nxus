/**
 * Query Builder Feature
 *
 * A Tana-inspired query builder for filtering and searching nodes.
 */

// Main components
export { QueryBuilder } from './query-builder.js'
export type { QueryBuilderProps } from './query-builder.js'

export { QueryBuilderWithSaved } from './query-builder-with-saved.js'
export type { QueryBuilderWithSavedProps } from './query-builder-with-saved.js'

export { SavedQueriesPanel } from './saved-queries-panel.js'
export type { SavedQueriesPanelProps } from './saved-queries-panel.js'

// Sub-components
export { FilterList } from './filter-list.js'
export type { FilterListProps } from './filter-list.js'

export { FilterChip } from './filter-chip.js'
export type { FilterChipProps } from './filter-chip.js'

export { AddFilterMenu } from './add-filter-menu.js'
export type { AddFilterMenuProps } from './add-filter-menu.js'

export { SortConfig } from './sort-config.js'
export type { SortConfigProps } from './sort-config.js'

export { QueryLinter } from './query-linter.js'
export type { QueryLinterProps } from './query-linter.js'

// Filter editors
export {
  SupertagFilterEditor,
  PropertyFilterEditor,
  ContentFilterEditor,
  RelationFilterEditor,
  TemporalFilterEditor,
  HasFieldFilterEditor,
  LogicalFilterEditor,
} from './filters/index.js'
