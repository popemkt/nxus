import { describe, expect, it, vi } from 'vitest'
import type { GenericCommandContext } from '@nxus/db'
import { executeGenericCommandById } from './command-execution'

// Stable mock commands (shared across getGenericCommands calls)
const mockNavigateExecute = vi.fn((_targetId, _targetPath, context) => {
  context.navigate('/test-path')
})
const mockParamsExecute = vi.fn()

const mockCommands = [
  {
    id: 'test-navigate',
    name: 'Test Navigate',
    icon: 'Arrow',
    target: 'none' as const,
    execute: mockNavigateExecute,
  },
  {
    id: 'test-with-params',
    name: 'Test With Params',
    icon: 'Gear',
    target: 'item' as const,
    requirements: [{ name: 'tool', tagId: 'tag-1', label: 'Tool' }],
    execute: mockParamsExecute,
  },
]

vi.mock('@/services/command-palette/registry', () => ({
  commandRegistry: {
    getGenericCommands: () => mockCommands,
  },
}))

// Mock the params modal
const mockOpen = vi.fn()
vi.mock('@/stores/command-params-modal.store', () => ({
  commandParamsModalService: {
    open: (...args: unknown[]) => mockOpen(...args),
  },
}))

function createMockContext(
  overrides?: Partial<GenericCommandContext>,
): GenericCommandContext {
  return {
    navigate: vi.fn(),
    ...overrides,
  }
}

describe('executeGenericCommandById', () => {
  it('passes context through to command.execute for simple commands', async () => {
    const ctx = createMockContext()

    await executeGenericCommandById('test-navigate', ctx)

    expect(ctx.navigate).toHaveBeenCalledWith('/test-path')
  })

  it('passes context.navigate through to command.execute when params modal completes', async () => {
    const ctx = createMockContext()

    await executeGenericCommandById('test-with-params', ctx, 'app-123')

    // Should open the params modal
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test With Params',
        onComplete: expect.any(Function),
      }),
    )

    // Simulate modal completion
    const onComplete = mockOpen.mock.calls[0][0].onComplete
    onComplete({
      requirements: { tool: { appId: 'tool-1', value: { x: 1 } } },
      params: {},
    })

    expect(mockParamsExecute).toHaveBeenCalledWith('app-123', undefined, {
      navigate: ctx.navigate,
      requirements: { tool: { appId: 'tool-1', value: { x: 1 } } },
      params: {},
    })
  })

  it('logs error for unknown command ID', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = createMockContext()

    await executeGenericCommandById('nonexistent', ctx)

    expect(spy).toHaveBeenCalledWith('Command not found: nonexistent')
    spy.mockRestore()
  })
})
