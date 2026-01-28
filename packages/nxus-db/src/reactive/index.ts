/**
 * reactive/index.ts - Public exports for the reactive query system
 *
 * This module exports all types, schemas, and services for the reactive system.
 */

// Types and Zod schemas
export * from './types.js'

// Event bus factory and singleton
export { createEventBus, eventBus } from './event-bus.js'

// Query subscription service
export {
  createQuerySubscriptionService,
  querySubscriptionService,
  type QuerySubscriptionService,
  type QueryResultChangeCallback,
  type SubscriptionHandle,
} from './query-subscription.service.js'

// Automation service
export {
  createAutomationService,
  automationService,
  type AutomationService,
} from './automation.service.js'

// Computed field service
export {
  createComputedFieldService,
  computedFieldService,
  type ComputedFieldService,
  type ComputedFieldValueChangeCallback,
  type ComputedFieldValueChangeEvent,
} from './computed-field.service.js'
