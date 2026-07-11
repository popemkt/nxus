import { afterEach, describe, expect, it } from 'vitest'
import { createAutomationService } from '../automation.service.js'
import { createComputedFieldService } from '../computed-field.service.js'
import { createQuerySubscriptionService } from '../query-subscription.service.js'
import {
  assertReactiveSupported,
  REACTIVE_UNSUPPORTED_GRAPH_MESSAGE,
} from '../reactive-support.js'

const originalArchitectureType = process.env.ARCHITECTURE_TYPE

afterEach(() => {
  if (originalArchitectureType === undefined) {
    delete process.env.ARCHITECTURE_TYPE
  } else {
    process.env.ARCHITECTURE_TYPE = originalArchitectureType
  }
})

describe('reactive architecture support', () => {
  it('REACT-B1: initialize and subscribe fail fast in graph mode', () => {
    process.env.ARCHITECTURE_TYPE = 'graph'
    const db = {} as never
    const query = { filters: [], limit: 1 }

    expect(() => createComputedFieldService().initialize(db)).toThrow(
      REACTIVE_UNSUPPORTED_GRAPH_MESSAGE,
    )
    expect(() => createAutomationService().initialize(db)).toThrow(
      REACTIVE_UNSUPPORTED_GRAPH_MESSAGE,
    )
    expect(() =>
      createQuerySubscriptionService().subscribe(db, query, () => {}),
    ).toThrow(REACTIVE_UNSUPPORTED_GRAPH_MESSAGE)
  })

  it.each([undefined, 'node'])(
    'REACT-B2: support guard preserves %s architecture behavior',
    (architectureType) => {
      if (architectureType === undefined) {
        delete process.env.ARCHITECTURE_TYPE
      } else {
        process.env.ARCHITECTURE_TYPE = architectureType
      }

      expect(() => assertReactiveSupported()).not.toThrow()
    },
  )
})
