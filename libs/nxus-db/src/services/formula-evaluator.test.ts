import { describe, expect, it } from 'vitest'
import { evaluateFormulaExpression } from './formula-evaluator.js'

function context(values: Record<string, string | number | boolean | null> = {}, formulaFields: string[] = []) {
  return {
    values: new Map(Object.entries(values)),
    formulaFieldNames: new Set(formulaFields),
  }
}

describe('formula evaluator parsing stories', () => {
  it('parses literals and same-node field references', () => {
    expect(evaluateFormulaExpression('{Price}', context({ Price: 12 }))).toBe(12)
    expect(evaluateFormulaExpression('"SKU-" + {Code}', context({ Code: 'A1' }))).toBe('SKU-A1')
    expect(evaluateFormulaExpression('true == {Active}', context({ Active: true }))).toBe(true)
  })

  it('returns a structured error for invalid syntax', () => {
    expect(evaluateFormulaExpression('{Price', context({ Price: 12 }))).toEqual({
      error: 'Unclosed field reference',
    })
  })
})

describe('formula evaluator precedence stories', () => {
  it('honors arithmetic and logical precedence', () => {
    expect(evaluateFormulaExpression('2 + 3 * 4', context())).toBe(14)
    expect(evaluateFormulaExpression('(2 + 3) * 4', context())).toBe(20)
    expect(evaluateFormulaExpression('true || false && false', context())).toBe(true)
    expect(evaluateFormulaExpression('!({A} > 3 && {B} < 5)', context({ A: 4, B: 2 }))).toBe(false)
  })
})

describe('formula evaluator type mismatch stories', () => {
  it('rejects invalid operator operand types', () => {
    expect(evaluateFormulaExpression('"2" * 3', context())).toEqual({
      error: 'Operator * requires numbers',
    })
    expect(evaluateFormulaExpression('true + false', context())).toEqual({
      error: 'Operator + requires numbers or at least one string',
    })
    expect(evaluateFormulaExpression('1 && true', context())).toEqual({
      error: 'Operator && requires booleans',
    })
  })
})

describe('formula evaluator missing reference stories', () => {
  it('returns a structured error for missing references', () => {
    expect(evaluateFormulaExpression('{Missing} + 1', context())).toEqual({
      error: 'Missing referenced field: Missing',
    })
  })

  it('returns a structured error for non-scalar references', () => {
    expect(
      evaluateFormulaExpression('{Items} + 1', {
        values: new Map([['Items', ['a', 'b']]]),
        formulaFieldNames: new Set(),
      }),
    ).toEqual({
      error: 'Referenced field is not a scalar: Items',
    })
  })
})

describe('formula evaluator cycle rejection stories', () => {
  it('rejects references to formula fields', () => {
    expect(evaluateFormulaExpression('{Total} + 1', context({ Total: 2 }, ['Total']))).toEqual({
      error: 'Formula field cannot reference formula field: Total',
    })
  })
})

describe('formula evaluator division by zero stories', () => {
  it('rejects division and modulo by zero', () => {
    expect(evaluateFormulaExpression('10 / 0', context())).toEqual({ error: 'Division by zero' })
    expect(evaluateFormulaExpression('10 % 0', context())).toEqual({ error: 'Division by zero' })
  })
})
