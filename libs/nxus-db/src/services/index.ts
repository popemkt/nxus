// Barrel export for services
export * from './node.service.js'
export * from './bootstrap.js'
export * from './query-evaluator.service.js'

// Facade and backend types
export * from './facade.js'
export type { NodeBackend } from './backends/types.js'

// Reactive system services (event bus, query subscriptions, automations)
// Re-export everything from the reactive module
export * from '../reactive/index.js'
