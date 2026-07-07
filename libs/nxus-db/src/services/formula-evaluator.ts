import type { JsonValue } from '../types/common.js'

export type FormulaScalar = string | number | boolean
export type FormulaError = { error: string }
export type FormulaResult = FormulaScalar | FormulaError

export interface FormulaReferenceContext {
  values: Map<string, JsonValue>
  formulaFieldNames: Set<string>
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'reference'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'leftParen' }
  | { type: 'rightParen' }
  | { type: 'eof' }

type Expr =
  | { type: 'literal'; value: FormulaScalar }
  | { type: 'reference'; fieldName: string }
  | { type: 'unary'; operator: '!' | '-'; right: Expr }
  | { type: 'binary'; operator: string; left: Expr; right: Expr }

const BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
])

export function evaluateFormulaExpression(
  expression: string,
  context: FormulaReferenceContext,
): FormulaResult {
  try {
    const tokens = tokenize(expression)
    const parser = new Parser(tokens)
    const expr = parser.parse()
    return evaluate(expr, context)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid formula' }
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]!

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === '(') {
      tokens.push({ type: 'leftParen' })
      index += 1
      continue
    }

    if (char === ')') {
      tokens.push({ type: 'rightParen' })
      index += 1
      continue
    }

    if (char === '{') {
      const end = input.indexOf('}', index + 1)
      if (end === -1) throw new Error('Unclosed field reference')
      const value = input.slice(index + 1, end).trim()
      if (!value) throw new Error('Empty field reference')
      tokens.push({ type: 'reference', value })
      index = end + 1
      continue
    }

    if (char === '"' || char === "'") {
      const quote = char
      let value = ''
      index += 1
      while (index < input.length && input[index] !== quote) {
        const current = input[index]!
        if (current === '\\') {
          index += 1
          if (index >= input.length) throw new Error('Unclosed string literal')
          const escaped = input[index]!
          value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped
          index += 1
        } else {
          value += current
          index += 1
        }
      }
      if (input[index] !== quote) throw new Error('Unclosed string literal')
      index += 1
      tokens.push({ type: 'string', value })
      continue
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(input[index + 1] ?? ''))) {
      const start = index
      while (/\d/.test(input[index] ?? '')) index += 1
      if (input[index] === '.') {
        index += 1
        while (/\d/.test(input[index] ?? '')) index += 1
      }
      const raw = input.slice(start, index)
      const value = Number(raw)
      if (!Number.isFinite(value)) throw new Error(`Invalid number literal: ${raw}`)
      tokens.push({ type: 'number', value })
      continue
    }

    if (/[A-Za-z]/.test(char)) {
      const start = index
      while (/[A-Za-z]/.test(input[index] ?? '')) index += 1
      const word = input.slice(start, index)
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', value: word === 'true' })
        continue
      }
      throw new Error(`Unexpected identifier: ${word}`)
    }

    const twoChar = input.slice(index, index + 2)
    if (BINARY_OPERATORS.has(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar })
      index += 2
      continue
    }

    if (BINARY_OPERATORS.has(char) || char === '!') {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }

    throw new Error(`Unexpected character: ${char}`)
  }

  tokens.push({ type: 'eof' })
  return tokens
}

class Parser {
  private current = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expr = this.parseOr()
    if (!this.check('eof')) throw new Error('Unexpected token after expression')
    return expr
  }

  private parseOr(): Expr {
    let expr = this.parseAnd()
    while (this.matchOperator('||')) {
      expr = { type: 'binary', operator: '||', left: expr, right: this.parseAnd() }
    }
    return expr
  }

  private parseAnd(): Expr {
    let expr = this.parseEquality()
    while (this.matchOperator('&&')) {
      expr = { type: 'binary', operator: '&&', left: expr, right: this.parseEquality() }
    }
    return expr
  }

  private parseEquality(): Expr {
    let expr = this.parseComparison()
    while (this.matchOperator('==') || this.matchOperator('!=')) {
      const operator = this.previousOperator()
      expr = { type: 'binary', operator, left: expr, right: this.parseComparison() }
    }
    return expr
  }

  private parseComparison(): Expr {
    let expr = this.parseTerm()
    while (
      this.matchOperator('<') ||
      this.matchOperator('<=') ||
      this.matchOperator('>') ||
      this.matchOperator('>=')
    ) {
      const operator = this.previousOperator()
      expr = { type: 'binary', operator, left: expr, right: this.parseTerm() }
    }
    return expr
  }

  private parseTerm(): Expr {
    let expr = this.parseFactor()
    while (this.matchOperator('+') || this.matchOperator('-')) {
      const operator = this.previousOperator()
      expr = { type: 'binary', operator, left: expr, right: this.parseFactor() }
    }
    return expr
  }

  private parseFactor(): Expr {
    let expr = this.parseUnary()
    while (
      this.matchOperator('*') ||
      this.matchOperator('/') ||
      this.matchOperator('%')
    ) {
      const operator = this.previousOperator()
      expr = { type: 'binary', operator, left: expr, right: this.parseUnary() }
    }
    return expr
  }

  private parseUnary(): Expr {
    if (this.matchOperator('!') || this.matchOperator('-')) {
      const operator = this.previousOperator() as '!' | '-'
      return { type: 'unary', operator, right: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    const token = this.advance()
    if (token.type === 'number' || token.type === 'string' || token.type === 'boolean') {
      return { type: 'literal', value: token.value }
    }
    if (token.type === 'reference') {
      return { type: 'reference', fieldName: token.value }
    }
    if (token.type === 'leftParen') {
      const expr = this.parseOr()
      if (!this.match('rightParen')) throw new Error('Expected closing parenthesis')
      return expr
    }
    throw new Error('Expected expression')
  }

  private match(type: Token['type']): boolean {
    if (!this.check(type)) return false
    this.advance()
    return true
  }

  private matchOperator(value: string): boolean {
    const token = this.peek()
    if (token.type !== 'operator' || token.value !== value) return false
    this.advance()
    return true
  }

  private check(type: Token['type']): boolean {
    return this.peek().type === type
  }

  private advance(): Token {
    if (!this.check('eof')) this.current += 1
    return this.tokens[this.current - 1]!
  }

  private peek(): Token {
    return this.tokens[this.current]!
  }

  private previousOperator(): string {
    const token = this.tokens[this.current - 1]!
    if (token.type !== 'operator') throw new Error('Expected operator')
    return token.value
  }
}

function evaluate(expr: Expr, context: FormulaReferenceContext): FormulaResult {
  switch (expr.type) {
    case 'literal':
      return expr.value
    case 'reference':
      return resolveReference(expr.fieldName, context)
    case 'unary': {
      const right = evaluate(expr.right, context)
      if (isFormulaError(right)) return right
      if (expr.operator === '!') {
        if (typeof right !== 'boolean') return { error: 'Operator ! requires a boolean' }
        return !right
      }
      if (typeof right !== 'number') return { error: 'Unary - requires a number' }
      return -right
    }
    case 'binary': {
      const left = evaluate(expr.left, context)
      if (isFormulaError(left)) return left
      const right = evaluate(expr.right, context)
      if (isFormulaError(right)) return right
      return evaluateBinary(expr.operator, left, right)
    }
  }
}

function resolveReference(
  fieldName: string,
  context: FormulaReferenceContext,
): FormulaResult {
  if (context.formulaFieldNames.has(fieldName)) {
    return { error: `Formula field cannot reference formula field: ${fieldName}` }
  }
  if (!context.values.has(fieldName)) {
    return { error: `Missing referenced field: ${fieldName}` }
  }
  const value = context.values.get(fieldName)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return { error: `Referenced field is not a scalar: ${fieldName}` }
}

function evaluateBinary(
  operator: string,
  left: FormulaScalar,
  right: FormulaScalar,
): FormulaResult {
  switch (operator) {
    case '+':
      if (typeof left === 'number' && typeof right === 'number') return left + right
      if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right)
      return { error: 'Operator + requires numbers or at least one string' }
    case '-':
    case '*':
    case '/':
    case '%':
      return evaluateNumericOperator(operator, left, right)
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '<':
    case '<=':
    case '>':
    case '>=':
      return evaluateComparison(operator, left, right)
    case '&&':
    case '||':
      if (typeof left !== 'boolean' || typeof right !== 'boolean') {
        return { error: `Operator ${operator} requires booleans` }
      }
      return operator === '&&' ? left && right : left || right
    default:
      return { error: `Unsupported operator: ${operator}` }
  }
}

function evaluateNumericOperator(
  operator: string,
  left: FormulaScalar,
  right: FormulaScalar,
): FormulaResult {
  if (typeof left !== 'number' || typeof right !== 'number') {
    return { error: `Operator ${operator} requires numbers` }
  }
  if ((operator === '/' || operator === '%') && right === 0) {
    return { error: 'Division by zero' }
  }
  if (operator === '-') return left - right
  if (operator === '*') return left * right
  if (operator === '/') return left / right
  return left % right
}

function evaluateComparison(
  operator: string,
  left: FormulaScalar,
  right: FormulaScalar,
): FormulaResult {
  if (typeof left !== typeof right || typeof left === 'boolean') {
    return { error: `Operator ${operator} requires matching numbers or strings` }
  }
  if (operator === '<') return left < right
  if (operator === '<=') return left <= right
  if (operator === '>') return left > right
  return left >= right
}

function isFormulaError(value: FormulaResult): value is FormulaError {
  return typeof value === 'object' && value !== null && 'error' in value
}
