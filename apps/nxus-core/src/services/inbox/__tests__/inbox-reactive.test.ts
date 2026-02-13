/**
 * inbox-reactive.test.ts - Unit tests for inbox reactive server function logic
 *
 * Tests:
 * 1. Template expansion produces correct AutomationDefinition for each template
 * 2. Computed field definitions have correct query structures
 * 3. Error handling for missing required config
 */

import { describe, expect, it } from 'vitest'
import {
  expandAutomationTemplate,
  getInboxComputedFieldDefs,
  getInboxQueries,
} from '../inbox-reactive.server.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '@nxus/db'

// ============================================================================
// Template Expansion Tests
// ============================================================================

describe('expandAutomationTemplate', () => {
  describe('auto_archive template', () => {
    it('should produce a query_membership trigger with onEnter for done items', () => {
      const def = expandAutomationTemplate('auto_archive', {})

      expect(def.name).toBe('Auto-archive done items')
      expect(def.enabled).toBe(true)
      expect(def.trigger.type).toBe('query_membership')

      if (def.trigger.type === 'query_membership') {
        expect(def.trigger.event).toBe('onEnter')

        const filters = def.trigger.queryDefinition.filters
        expect(filters).toHaveLength(2)

        // First filter: inbox supertag
        expect(filters[0]).toEqual(
          expect.objectContaining({
            type: 'supertag',
            supertagId: SYSTEM_SUPERTAGS.INBOX,
          }),
        )

        // Second filter: status = done
        expect(filters[1]).toEqual(
          expect.objectContaining({
            type: 'property',
            fieldId: SYSTEM_FIELDS.STATUS as string,
            op: 'eq',
            value: 'done',
          }),
        )
      }
    })

    it('should produce a set_property action with ARCHIVED_AT and $now marker', () => {
      const def = expandAutomationTemplate('auto_archive', {})

      expect(def.action.type).toBe('set_property')
      if (def.action.type === 'set_property') {
        expect(def.action.fieldId).toBe(SYSTEM_FIELDS.ARCHIVED_AT as string)
        expect(def.action.value).toEqual({ $now: true })
      }
    })
  })

  describe('backlog_overflow template', () => {
    const validConfig = {
      threshold: 15,
      webhookUrl: 'https://hooks.example.com/inbox-alert',
    }
    const pendingCfId = 'cf-pending-count-id'

    it('should produce a threshold trigger with correct config', () => {
      const def = expandAutomationTemplate(
        'backlog_overflow',
        validConfig,
        pendingCfId,
      )

      expect(def.name).toBe('Alert when pending > 15')
      expect(def.enabled).toBe(true)
      expect(def.trigger.type).toBe('threshold')

      if (def.trigger.type === 'threshold') {
        expect(def.trigger.computedFieldId).toBe(pendingCfId)
        expect(def.trigger.condition).toEqual({
          operator: 'gt',
          value: 15,
        })
        expect(def.trigger.fireOnce).toBe(true)
      }
    })

    it('should produce a webhook action with correct url and body', () => {
      const def = expandAutomationTemplate(
        'backlog_overflow',
        validConfig,
        pendingCfId,
      )

      expect(def.action.type).toBe('webhook')
      if (def.action.type === 'webhook') {
        expect(def.action.url).toBe('https://hooks.example.com/inbox-alert')
        expect(def.action.method).toBe('POST')
        expect(def.action.body).toEqual({
          alert: 'inbox_overflow',
          pendingCount: '{{ computedField.value }}',
          timestamp: '{{ timestamp }}',
        })
      }
    })

    it('should default threshold to 20 when not provided', () => {
      const def = expandAutomationTemplate(
        'backlog_overflow',
        { webhookUrl: 'https://hooks.example.com/test' },
        pendingCfId,
      )

      expect(def.name).toBe('Alert when pending > 20')
      if (def.trigger.type === 'threshold') {
        expect(def.trigger.condition.value).toBe(20)
      }
    })

    it('should throw when webhookUrl is missing', () => {
      expect(() =>
        expandAutomationTemplate('backlog_overflow', {}, pendingCfId),
      ).toThrow('backlog_overflow template requires webhookUrl in config')
    })

    it('should throw when pendingCountComputedFieldId is missing', () => {
      expect(() =>
        expandAutomationTemplate('backlog_overflow', {
          webhookUrl: 'https://hooks.example.com/test',
        }),
      ).toThrow(
        'backlog_overflow template requires pendingCountComputedFieldId',
      )
    })
  })

  describe('auto_tag template', () => {
    const validConfig = {
      keyword: 'bug',
      supertagId: 'supertag-bug-uuid',
    }

    it('should produce a query_membership trigger with content filter', () => {
      const def = expandAutomationTemplate('auto_tag', validConfig)

      expect(def.name).toBe('Auto-tag "bug"')
      expect(def.enabled).toBe(true)
      expect(def.trigger.type).toBe('query_membership')

      if (def.trigger.type === 'query_membership') {
        expect(def.trigger.event).toBe('onEnter')

        const filters = def.trigger.queryDefinition.filters
        expect(filters).toHaveLength(2)

        // First filter: inbox supertag
        expect(filters[0]).toEqual(
          expect.objectContaining({
            type: 'supertag',
            supertagId: SYSTEM_SUPERTAGS.INBOX,
          }),
        )

        // Second filter: content contains keyword
        expect(filters[1]).toEqual(
          expect.objectContaining({
            type: 'content',
            query: 'bug',
            caseSensitive: false,
          }),
        )
      }
    })

    it('should produce an add_supertag action', () => {
      const def = expandAutomationTemplate('auto_tag', validConfig)

      expect(def.action.type).toBe('add_supertag')
      if (def.action.type === 'add_supertag') {
        expect(def.action.supertagId).toBe('supertag-bug-uuid')
      }
    })

    it('should throw when keyword is missing', () => {
      expect(() =>
        expandAutomationTemplate('auto_tag', { supertagId: 'some-id' }),
      ).toThrow('auto_tag template requires keyword in config')
    })

    it('should throw when supertagId is missing', () => {
      expect(() =>
        expandAutomationTemplate('auto_tag', { keyword: 'bug' }),
      ).toThrow('auto_tag template requires supertagId in config')
    })
  })

  describe('unknown template', () => {
    it('should throw for unknown templates', () => {
      expect(() =>
        expandAutomationTemplate('unknown' as any, {}),
      ).toThrow('Unknown automation template: unknown')
    })
  })
})

// ============================================================================
// Computed Field Definition Tests
// ============================================================================

describe('getInboxComputedFieldDefs', () => {
  const defs = getInboxComputedFieldDefs()

  it('should define 4 computed fields', () => {
    expect(defs).toHaveLength(4)
  })

  it('should define Total Items as COUNT of all inbox items', () => {
    const totalDef = defs.find((d) => d.name === 'Inbox: Total Items')
    expect(totalDef).toBeDefined()
    expect(totalDef!.definition.aggregation).toBe('COUNT')

    const filters = totalDef!.definition.query.filters
    expect(filters).toHaveLength(1)
    expect(filters[0]).toEqual(
      expect.objectContaining({
        type: 'supertag',
        supertagId: SYSTEM_SUPERTAGS.INBOX,
      }),
    )
  })

  it('should define Pending Count as COUNT of inbox items with status=pending', () => {
    const pendingDef = defs.find((d) => d.name === 'Inbox: Pending Count')
    expect(pendingDef).toBeDefined()
    expect(pendingDef!.definition.aggregation).toBe('COUNT')

    const filters = pendingDef!.definition.query.filters
    expect(filters).toHaveLength(2)
    expect(filters[0]).toEqual(
      expect.objectContaining({
        type: 'supertag',
        supertagId: SYSTEM_SUPERTAGS.INBOX,
      }),
    )
    expect(filters[1]).toEqual(
      expect.objectContaining({
        type: 'property',
        fieldId: SYSTEM_FIELDS.STATUS as string,
        op: 'eq',
        value: 'pending',
      }),
    )
  })

  it('should define Processing Count as COUNT of inbox items with status=processing', () => {
    const processingDef = defs.find(
      (d) => d.name === 'Inbox: Processing Count',
    )
    expect(processingDef).toBeDefined()
    expect(processingDef!.definition.aggregation).toBe('COUNT')

    const filters = processingDef!.definition.query.filters
    expect(filters).toHaveLength(2)
    expect(filters[1]).toEqual(
      expect.objectContaining({
        type: 'property',
        value: 'processing',
      }),
    )
  })

  it('should define Done Count as COUNT of inbox items with status=done', () => {
    const doneDef = defs.find((d) => d.name === 'Inbox: Done Count')
    expect(doneDef).toBeDefined()
    expect(doneDef!.definition.aggregation).toBe('COUNT')

    const filters = doneDef!.definition.query.filters
    expect(filters).toHaveLength(2)
    expect(filters[1]).toEqual(
      expect.objectContaining({
        type: 'property',
        value: 'done',
      }),
    )
  })
})

// ============================================================================
// Query Definition Tests
// ============================================================================

describe('getInboxQueries', () => {
  const queries = getInboxQueries()

  it('should define allItems query with inbox supertag filter', () => {
    expect(queries.allItems.filters).toHaveLength(1)
    expect(queries.allItems.filters[0]).toEqual(
      expect.objectContaining({
        type: 'supertag',
        supertagId: SYSTEM_SUPERTAGS.INBOX,
      }),
    )
  })

  it('should define pendingItems query with inbox + status=pending filters', () => {
    expect(queries.pendingItems.filters).toHaveLength(2)
    expect(queries.pendingItems.filters[1]).toEqual(
      expect.objectContaining({
        type: 'property',
        fieldId: SYSTEM_FIELDS.STATUS as string,
        op: 'eq',
        value: 'pending',
      }),
    )
  })

  it('should define processingItems query with inbox + status=processing filters', () => {
    expect(queries.processingItems.filters).toHaveLength(2)
    expect(queries.processingItems.filters[1]).toEqual(
      expect.objectContaining({
        value: 'processing',
      }),
    )
  })

  it('should define doneItems query with inbox + status=done filters', () => {
    expect(queries.doneItems.filters).toHaveLength(2)
    expect(queries.doneItems.filters[1]).toEqual(
      expect.objectContaining({
        value: 'done',
      }),
    )
  })
})
