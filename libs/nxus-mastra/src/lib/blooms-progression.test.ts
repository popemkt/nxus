import { describe, it, expect } from 'vitest'
import { nextBloomsLevel } from './blooms-progression.js'

describe('nextBloomsLevel', () => {
  it('bumps up on good rating', () => {
    expect(nextBloomsLevel('remember', 'apply', 3)).toBe('understand')
  })

  it('bumps up on easy rating', () => {
    expect(nextBloomsLevel('remember', 'apply', 4)).toBe('understand')
  })

  it('stays on hard rating', () => {
    expect(nextBloomsLevel('understand', 'apply', 2)).toBe('understand')
  })

  it('drops back on again rating', () => {
    expect(nextBloomsLevel('understand', 'apply', 1)).toBe('remember')
  })

  it('does not drop below remember', () => {
    expect(nextBloomsLevel('remember', 'apply', 1)).toBe('remember')
  })

  it('does not exceed ceiling', () => {
    expect(nextBloomsLevel('understand', 'apply', 3)).toBe('apply')
    expect(nextBloomsLevel('apply', 'apply', 3)).toBe('apply')
  })

  it('handles ceiling at remember', () => {
    expect(nextBloomsLevel('remember', 'remember', 3)).toBe('remember')
    expect(nextBloomsLevel('remember', 'remember', 4)).toBe('remember')
  })

  it('progresses through full chain', () => {
    let level = nextBloomsLevel('remember', 'create', 3)
    expect(level).toBe('understand')
    level = nextBloomsLevel(level, 'create', 3)
    expect(level).toBe('apply')
    level = nextBloomsLevel(level, 'create', 3)
    expect(level).toBe('analyze')
    level = nextBloomsLevel(level, 'create', 3)
    expect(level).toBe('evaluate')
    level = nextBloomsLevel(level, 'create', 3)
    expect(level).toBe('create')
  })
})
