/**
 * node-items.server.test.ts - Tests for node-to-Item/Command adapters
 *
 * Migrated from libs/nxus-workbench/src/server/adapters.test.ts after
 * decoupling nxus-core from the workbench package.
 */

import type {
  AssembledNode,
  ExecuteCommand,
  ItemCommand,
  JsonValue,
  PropertyValue,
  TagRef,
  WorkflowCommand,
} from '@nxus/db'
import { FIELD_NAMES } from '@nxus/db'
import { describe, expect, it } from 'vitest'
import { nodeToCommand, nodeToItem } from './node-items.server'

// Helper to create a mock AssembledNode
function createMockNode(overrides: Partial<AssembledNode> = {}): AssembledNode {
  return {
    id: 'test-node-id',
    content: 'Test Node',
    systemId: null,
    ownerId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    deletedAt: null,
    properties: {},
    supertags: [],
    ...overrides,
  }
}

// Helper to create a property array
function createProperty(
  value: JsonValue,
  fieldName: string,
  fieldSystemId: string | null = null,
  order = 0,
): Array<PropertyValue> {
  return [
    {
      value,
      rawValue: JSON.stringify(value),
      fieldNodeId: `field-${fieldName.toLowerCase()}`,
      fieldName,
      fieldSystemId,
      order,
    },
  ]
}

describe('nodeToItem', () => {
  it('should convert a basic node to Item', () => {
    const node = createMockNode({
      content: 'My Tool',
      systemId: 'item:my-tool',
      supertags: [
        { id: 'st-1', content: '#Tool', systemId: 'supertag:tool' },
      ],
      properties: {
        [FIELD_NAMES.DESCRIPTION]: createProperty(
          'A helpful tool',
          'description',
        ),
        [FIELD_NAMES.PATH]: createProperty('/usr/bin/mytool', 'path'),
      },
    })

    const item = nodeToItem(node)

    expect(item.id).toBe('my-tool')
    expect(item.name).toBe('My Tool')
    expect(item.description).toBe('A helpful tool')
    expect(item.path).toBe('/usr/bin/mytool')
    expect(item.type).toBe('tool')
  })

  it('should use legacyId if available', () => {
    const node = createMockNode({
      content: 'Tool',
      systemId: 'item:new-id',
      supertags: [
        { id: 'st-1', content: '#Tool', systemId: 'supertag:tool' },
      ],
      properties: {
        [FIELD_NAMES.LEGACY_ID]: createProperty('old-legacy-id', 'legacyId'),
      },
    })

    const item = nodeToItem(node)
    expect(item.id).toBe('old-legacy-id')
  })

  it('should set type based on supertag', () => {
    const toolNode = createMockNode({
      supertags: [
        { id: 'st-1', content: '#Tool', systemId: 'supertag:tool' },
      ],
    })
    expect(nodeToItem(toolNode).type).toBe('tool')

    const repoNode = createMockNode({
      supertags: [
        { id: 'st-1', content: '#Repo', systemId: 'supertag:repo' },
      ],
    })
    expect(nodeToItem(repoNode).type).toBe('remote-repo')
  })

  it('should resolve tag refs via callback', () => {
    const node = createMockNode({
      supertags: [
        { id: 'st-1', content: '#Item', systemId: 'supertag:item' },
      ],
      properties: {
        [FIELD_NAMES.TAGS]: createProperty('tag-node-1', 'tags'),
      },
    })

    const mockTagRefs: Array<TagRef> = [{ id: 'tag-1', name: 'Resolved Tag' }]
    const item = nodeToItem(node, {
      resolveTagRefs: () => mockTagRefs,
    })

    expect(item.metadata.tags).toEqual(mockTagRefs)
  })

  it('should resolve commands via callback', () => {
    const node = createMockNode({
      id: 'item-node-id',
      supertags: [
        { id: 'st-1', content: '#Item', systemId: 'supertag:item' },
      ],
    })

    const mockCommands: Array<ItemCommand> = [
      {
        id: 'cmd-1',
        name: 'Run',
        icon: 'play',
        category: 'action',
        target: 'item',
        mode: 'execute',
        command: 'npm run start',
      },
    ]

    const item = nodeToItem(node, {
      resolveCommands: (itemId) => {
        expect(itemId).toBe('item-node-id')
        return mockCommands
      },
    })

    expect(item.commands).toEqual(mockCommands)
  })

  it('should include timestamps in metadata', () => {
    const node = createMockNode({
      createdAt: new Date('2024-01-15T10:30:00Z'),
      updatedAt: new Date('2024-02-20T14:45:00Z'),
    })

    const item = nodeToItem(node)

    expect(item.metadata.createdAt).toBe('2024-01-15T10:30:00.000Z')
    expect(item.metadata.updatedAt).toBe('2024-02-20T14:45:00.000Z')
  })
})

describe('nodeToCommand', () => {
  it('should convert a basic execute command', () => {
    const node = createMockNode({
      content: 'Build Project',
      properties: {
        [FIELD_NAMES.COMMAND_ID]: createProperty('cmd-build', 'commandId'),
        [FIELD_NAMES.DESCRIPTION]: createProperty(
          'Build the entire project',
          'description',
        ),
        [FIELD_NAMES.ICON]: createProperty('hammer', 'icon'),
        [FIELD_NAMES.CATEGORY]: createProperty('build', 'category'),
        [FIELD_NAMES.TARGET]: createProperty('item', 'target'),
        [FIELD_NAMES.MODE]: createProperty('execute', 'mode'),
        [FIELD_NAMES.COMMAND]: createProperty('npm run build', 'command'),
        [FIELD_NAMES.CWD]: createProperty('/project', 'cwd'),
      },
    })

    const cmd = nodeToCommand(node) as ExecuteCommand

    expect(cmd.id).toBe('cmd-build')
    expect(cmd.name).toBe('Build Project')
    expect(cmd.description).toBe('Build the entire project')
    expect(cmd.icon).toBe('hammer')
    expect(cmd.category).toBe('build')
    expect(cmd.target).toBe('item')
    expect(cmd.mode).toBe('execute')
    expect(cmd.command).toBe('npm run build')
    expect(cmd.cwd).toBe('/project')
  })

  it('should convert a workflow command', () => {
    const workflowDefinition = {
      steps: [
        { action: 'build' },
        { action: 'test' },
        { action: 'deploy' },
      ],
    }

    const node = createMockNode({
      content: 'Deploy Pipeline',
      properties: {
        [FIELD_NAMES.MODE]: createProperty('workflow', 'mode'),
        [FIELD_NAMES.WORKFLOW]: createProperty(workflowDefinition, 'workflow'),
      },
    })

    const cmd = nodeToCommand(node) as WorkflowCommand

    expect(cmd.mode).toBe('workflow')
    expect(cmd.workflow).toEqual(workflowDefinition)
    expect((cmd as Record<string, unknown>).command).toBeUndefined()
  })

  it('should use default values for missing properties', () => {
    const node = createMockNode({
      content: 'Simple Command',
    })

    const cmd = nodeToCommand(node)

    expect(cmd.icon).toBe('terminal')
    expect(cmd.category).toBe('general')
    expect(cmd.target).toBe('item')
    expect(cmd.mode).toBe('execute')
  })

  it('should include platforms when specified', () => {
    const node = createMockNode({
      content: 'Linux-only Command',
      properties: {
        [FIELD_NAMES.PLATFORMS]: createProperty(['linux', 'macos'], 'platforms'),
      },
    })

    const cmd = nodeToCommand(node)

    expect(cmd.platforms).toEqual(['linux', 'macos'])
  })
})
