/**
 * Graph Controls
 *
 * Control panel components for the graph visualization.
 * Includes settings panel, renderer switcher, and legend.
 */

// Main control panel
export { GraphControls, type GraphControlsProps } from './GraphControls'

// Renderer toggle
export { RendererSwitcher, type RendererSwitcherProps } from './RendererSwitcher'

// Legend with filtering
export { GraphLegend, type GraphLegendProps } from './GraphLegend'

// Re-export sections for direct use if needed
export {
  CollapsibleSection,
  DisplaySection,
  FilterSection,
  LocalGraphSection,
  PhysicsSection,
  type CollapsibleSectionProps,
} from './sections'
