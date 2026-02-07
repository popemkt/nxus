/**
 * exports.test.ts - Verify that the reactive module is properly exported
 *
 * This test validates that all reactive types, schemas, factories, and singletons
 * are correctly exported from the package's entry points.
 */

import { describe, it, expect } from 'vitest'

describe('Reactive module exports', () => {
  it('exports reactive types from types/index.ts', async () => {
    const typesExports = await import('../../types/index.js')

    // Check Zod schemas are exported
    expect(typesExports.MutationTypeSchema).toBeDefined()
    expect(typesExports.AutomationDefinitionSchema).toBeDefined()
    expect(typesExports.AutomationActionSchema).toBeDefined()
    expect(typesExports.AutomationTriggerSchema).toBeDefined()
    expect(typesExports.ComputedFieldDefinitionSchema).toBeDefined()
    expect(typesExports.QueryMembershipTriggerSchema).toBeDefined()
    expect(typesExports.ThresholdTriggerSchema).toBeDefined()
    expect(typesExports.SetPropertyActionSchema).toBeDefined()
    expect(typesExports.WebhookActionSchema).toBeDefined()

    // Check type guards are exported
    expect(typesExports.isQueryMembershipTrigger).toBeDefined()
    expect(typesExports.isThresholdTrigger).toBeDefined()
    expect(typesExports.isSetPropertyAction).toBeDefined()
    expect(typesExports.isAddSupertagAction).toBeDefined()
    expect(typesExports.isRemoveSupertagAction).toBeDefined()
    expect(typesExports.isCreateNodeAction).toBeDefined()
    expect(typesExports.isWebhookAction).toBeDefined()
    expect(typesExports.isNowMarker).toBeDefined()
  })

  it('exports reactive services from services/index.ts', async () => {
    const servicesExports = await import('../../services/index.js')

    // Check factories are exported
    expect(servicesExports.createEventBus).toBeDefined()
    expect(servicesExports.createQuerySubscriptionService).toBeDefined()
    expect(servicesExports.createAutomationService).toBeDefined()

    // Check singletons are exported
    expect(servicesExports.eventBus).toBeDefined()
    expect(servicesExports.querySubscriptionService).toBeDefined()
    expect(servicesExports.automationService).toBeDefined()

    // Verify eventBus has expected methods
    expect(typeof servicesExports.eventBus.subscribe).toBe('function')
    expect(typeof servicesExports.eventBus.emit).toBe('function')
    expect(typeof servicesExports.eventBus.listenerCount).toBe('function')
    expect(typeof servicesExports.eventBus.clear).toBe('function')

    // Verify querySubscriptionService has expected methods
    expect(typeof servicesExports.querySubscriptionService.subscribe).toBe('function')
    expect(typeof servicesExports.querySubscriptionService.unsubscribe).toBe('function')
    expect(typeof servicesExports.querySubscriptionService.subscriptionCount).toBe('function')
  })

  it('exports reactive module from server.ts entry point', async () => {
    const serverExports = await import('../../server.js')

    // Server entry re-exports services, which includes reactive
    expect(serverExports.createEventBus).toBeDefined()
    expect(serverExports.createQuerySubscriptionService).toBeDefined()
    expect(serverExports.createAutomationService).toBeDefined()
    expect(serverExports.eventBus).toBeDefined()

    // Server entry also re-exports main entry (types)
    expect(serverExports.MutationTypeSchema).toBeDefined()
    expect(serverExports.AutomationDefinitionSchema).toBeDefined()
  })

  it('exports reactive types from main index.ts entry point', async () => {
    const mainExports = await import('../../index.js')

    // Main entry point should export types (via types/index)
    expect(mainExports.MutationTypeSchema).toBeDefined()
    expect(mainExports.AutomationDefinitionSchema).toBeDefined()
    expect(mainExports.isQueryMembershipTrigger).toBeDefined()
  })
})
