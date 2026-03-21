/**
 * field-visibility.test.ts — Unit tests for field hideWhen visibility
 * logic and required-field detection.
 *
 * These are pure logic tests for the field constraint evaluation
 * extracted from fields-section.tsx behavior.
 */

import { describe, it, expect } from 'vitest'
import type { HideWhen, OutlineField } from '@/types/outline'

// ─── Test helpers ────────────────────────────────────────────────

function makeField(overrides: Partial<OutlineField> = {}): OutlineField {
  return {
    fieldId: 'f1',
    fieldName: 'Test Field',
    fieldNodeId: 'fn1',
    fieldSystemId: null,
    fieldType: 'text',
    values: [],
    ...overrides,
  }
}

/**
 * Replicate the hideWhen filter logic from FieldsSection.
 */
function isFieldVisible(field: OutlineField): boolean {
  if (!field.hideWhen || field.hideWhen === 'never') return true
  if (field.hideWhen === 'always') return false
  const hasValue =
    field.values.length > 0 &&
    field.values.some(
      (v) => v.value !== null && v.value !== '' && v.value !== undefined,
    )
  if (field.hideWhen === 'when_empty' && !hasValue) return false
  if (field.hideWhen === 'when_not_empty' && hasValue) return false
  return true
}

/**
 * Replicate the required-field warning logic from FieldRow.
 */
function isRequiredFieldEmpty(field: OutlineField): boolean {
  if (!field.required) return false
  const value =
    field.fieldType === 'nodes'
      ? field.values
          .flatMap((v) =>
            Array.isArray(v.value) ? v.value : [v.value],
          )
          .filter(Boolean)
      : field.values.length > 0
        ? field.values[0]!.value
        : undefined

  const isEmpty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  return isEmpty
}

// ─── Tests ───────────────────────────────────────────────────────

describe('field visibility (hideWhen)', () => {
  it('field with no hideWhen is always visible', () => {
    expect(isFieldVisible(makeField())).toBe(true)
  })

  it('field with hideWhen="never" is always visible', () => {
    expect(isFieldVisible(makeField({ hideWhen: 'never' }))).toBe(true)
  })

  it('field with hideWhen="always" is never visible', () => {
    expect(isFieldVisible(makeField({ hideWhen: 'always' }))).toBe(false)
  })

  it('field with hideWhen="when_empty" and no values is hidden', () => {
    expect(
      isFieldVisible(makeField({ hideWhen: 'when_empty', values: [] })),
    ).toBe(false)
  })

  it('field with hideWhen="when_empty" and empty string value is hidden', () => {
    expect(
      isFieldVisible(
        makeField({
          hideWhen: 'when_empty',
          values: [{ value: '', order: 0 }],
        }),
      ),
    ).toBe(false)
  })

  it('field with hideWhen="when_empty" and null value is hidden', () => {
    expect(
      isFieldVisible(
        makeField({
          hideWhen: 'when_empty',
          values: [{ value: null, order: 0 }],
        }),
      ),
    ).toBe(false)
  })

  it('field with hideWhen="when_empty" and actual value is visible', () => {
    expect(
      isFieldVisible(
        makeField({
          hideWhen: 'when_empty',
          values: [{ value: 'Some text', order: 0 }],
        }),
      ),
    ).toBe(true)
  })

  it('field with hideWhen="when_not_empty" and no values is visible', () => {
    expect(
      isFieldVisible(
        makeField({ hideWhen: 'when_not_empty', values: [] }),
      ),
    ).toBe(true)
  })

  it('field with hideWhen="when_not_empty" and actual value is hidden', () => {
    expect(
      isFieldVisible(
        makeField({
          hideWhen: 'when_not_empty',
          values: [{ value: 'Filled', order: 0 }],
        }),
      ),
    ).toBe(false)
  })

  it('field with hideWhen="when_not_empty" and empty string is visible', () => {
    expect(
      isFieldVisible(
        makeField({
          hideWhen: 'when_not_empty',
          values: [{ value: '', order: 0 }],
        }),
      ),
    ).toBe(true)
  })
})

describe('required field detection', () => {
  it('non-required field is not flagged', () => {
    expect(isRequiredFieldEmpty(makeField({ values: [] }))).toBe(false)
  })

  it('required field with no values is empty', () => {
    expect(
      isRequiredFieldEmpty(makeField({ required: true, values: [] })),
    ).toBe(true)
  })

  it('required field with empty string is empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          values: [{ value: '', order: 0 }],
        }),
      ),
    ).toBe(true)
  })

  it('required field with null value is empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          values: [{ value: null, order: 0 }],
        }),
      ),
    ).toBe(true)
  })

  it('required field with actual value is not empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          values: [{ value: 'High', order: 0 }],
        }),
      ),
    ).toBe(false)
  })

  it('required nodes field with empty array is empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          fieldType: 'nodes',
          values: [],
        }),
      ),
    ).toBe(true)
  })

  it('required nodes field with references is not empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          fieldType: 'nodes',
          values: [{ value: ['ref-1', 'ref-2'], order: 0 }],
        }),
      ),
    ).toBe(false)
  })

  it('required number field with 0 is not empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          fieldType: 'number',
          values: [{ value: 0, order: 0 }],
        }),
      ),
    ).toBe(false)
  })

  it('required boolean field with false is not empty', () => {
    expect(
      isRequiredFieldEmpty(
        makeField({
          required: true,
          fieldType: 'boolean',
          values: [{ value: false, order: 0 }],
        }),
      ),
    ).toBe(false)
  })
})

describe('field pinned sorting', () => {
  it('pinned fields sort before non-pinned', () => {
    const fields = [
      makeField({ fieldId: 'f1', fieldName: 'Notes', pinned: false }),
      makeField({ fieldId: 'f2', fieldName: 'Priority', pinned: true }),
      makeField({ fieldId: 'f3', fieldName: 'Status', pinned: true }),
      makeField({ fieldId: 'f4', fieldName: 'Description' }),
    ]

    const sorted = [...fields].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return 0
    })

    expect(sorted[0]!.fieldName).toBe('Priority')
    expect(sorted[1]!.fieldName).toBe('Status')
    // Non-pinned fields come after
    expect(sorted[2]!.pinned).toBeFalsy()
    expect(sorted[3]!.pinned).toBeFalsy()
  })
})
