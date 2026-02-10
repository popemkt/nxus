import { describe, expect, it, vi } from 'vitest'
import { genericCommands } from './registry'
import type { GenericCommandContext } from '@nxus/db'

function createMockContext(
  overrides?: Partial<GenericCommandContext>,
): GenericCommandContext {
  return {
    navigate: vi.fn(),
    ...overrides,
  }
}

describe('Generic commands', () => {
  describe('navigation commands use context.navigate', () => {
    it('go-to-settings navigates to /settings', () => {
      const cmd = genericCommands.find((c) => c.id === 'go-to-settings')!
      const ctx = createMockContext()

      cmd.execute(undefined, undefined, ctx)

      expect(ctx.navigate).toHaveBeenCalledWith('/settings')
    })

    it('go-to-inbox navigates to /inbox', () => {
      const cmd = genericCommands.find((c) => c.id === 'go-to-inbox')!
      const ctx = createMockContext()

      cmd.execute(undefined, undefined, ctx)

      expect(ctx.navigate).toHaveBeenCalledWith('/inbox')
    })

    it('go-to-app navigates to /apps/{appId}', () => {
      const cmd = genericCommands.find((c) => c.id === 'go-to-app')!
      const ctx = createMockContext()

      cmd.execute('my-app-id', undefined, ctx)

      expect(ctx.navigate).toHaveBeenCalledWith('/apps/my-app-id')
    })
  })

  describe('all commands accept context parameter', () => {
    it.each(genericCommands.map((c) => [c.id, c]))(
      '%s has a 3-parameter execute function',
      (_id, cmd) => {
        // execute should accept (targetId, targetPath, context)
        expect(cmd.execute.length).toBeGreaterThanOrEqual(3)
      },
    )
  })
})
