import { describe, it, expect } from 'vitest'
import { splitContentIntoMentionSegments, hasInlineMentionToken } from './mentions'

const ID_A = '018f2c1a-1b2c-7d3e-8f4a-5b6c7d8e9f0a'
const ID_B = '018f2c1a-1b2c-7d3e-8f4a-5b6c7d8e9f0b'

describe('splitContentIntoMentionSegments', () => {
  it('returns a single text segment when there are no tokens', () => {
    expect(splitContentIntoMentionSegments('plain text')).toEqual([
      { type: 'text', text: 'plain text' },
    ])
  })

  it('returns empty for empty content', () => {
    expect(splitContentIntoMentionSegments('')).toEqual([])
  })

  it('splits text around a single token', () => {
    const content = `see [[node:${ID_A}]] please`
    expect(splitContentIntoMentionSegments(content)).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'mention', text: `[[node:${ID_A}]]`, nodeId: ID_A },
      { type: 'text', text: ' please' },
    ])
  })

  it('handles a token at the very start and end of content', () => {
    const content = `[[node:${ID_A}]]middle[[node:${ID_B}]]`
    expect(splitContentIntoMentionSegments(content)).toEqual([
      { type: 'mention', text: `[[node:${ID_A}]]`, nodeId: ID_A },
      { type: 'text', text: 'middle' },
      { type: 'mention', text: `[[node:${ID_B}]]`, nodeId: ID_B },
    ])
  })

  it('leaves malformed tokens as plain text', () => {
    const content = '[[node:not-a-uuid]]'
    expect(splitContentIntoMentionSegments(content)).toEqual([
      { type: 'text', text: '[[node:not-a-uuid]]' },
    ])
  })
})

describe('hasInlineMentionToken', () => {
  it('detects a token', () => {
    expect(hasInlineMentionToken(`mentions [[node:${ID_A}]]`)).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(hasInlineMentionToken('no tokens here')).toBe(false)
  })
})
