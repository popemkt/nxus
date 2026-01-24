/**
 * adapters.test.ts - Tests for node-to-legacy type adapters
 */

import type { AssembledNode, TagRef, ItemCommand } from '@nxus/db'
import { describe, expect, it } from 'vitest'
import { nodeToCommand, nodeToItem, nodeToTag, nodesToItems } from './adapters.js'

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
  value: unknown,
  fieldName: string,
  fieldSystemId: string | null = null,
  order = 0,
) {
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

describe('adapters', () => {
  describe('nodeToItem', () => {
    it('should convert a basic node to Item', () => {
      const node = createMockNode({
        content: 'My Tool',
        systemId: 'item:my-tool',
        supertags: [{ id: 'st-1', content: '#Tool', systemId: 'supertag:tool' }],
        properties: {
          description: createProperty('A helpful tool', 'description'),
          path: createProperty('/usr/bin/mytool', 'path'),
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
        supertags: [{ id: 'st-1', content: '#Tool', systemId: 'supertag:tool' }],
        properties: {
          legacyId: createProperty('old-legacy-id', 'legacyId'),
        },
      })

      const item = nodeToItem(node)
      expect(item.id).toBe('old-legacy-id')
    })

    it('should set type based on supertag', () => {
      const toolNode = createMockNode({
        supertags: [{ id: 'st-1', content: '#Tool', systemId: 'supertag:tool' }],
      })
      expect(nodeToItem(toolNode).type).toBe('tool')

      const repoNode = createMockNode({
        supertags: [{ id: 'st-1', content: '#Repo', systemId: 'supertag:repo' }],
      })
      expect(nodeToItem(repoNode).type).toBe('remote-repo')
    })

    it('should resolve tag refs via callback', () => {
      const node = createMockNode({
        supertags: [{ id: 'st-1', content: '#Item', systemId: 'supertag:item' }],
        properties: {
          tags: createProperty('tag-node-1', 'tags'),
        },
      })

      const mockTagRefs: TagRef[] = [{ id: 1, name: 'Resolved Tag' }]
      const item = nodeToItem(node, {
        resolveTagRefs: () => mockTagRefs,
      })

      expect(item.metadata.tags).toEqual(mockTagRefs)
    })

    it('should resolve commands via callback', () => {
      const node = createMockNode({
        id: 'item-node-id',
        supertags: [{ id: 'st-1', content: '#Item', systemId: 'supertag:item' }],
      })

      const mockCommands: ItemCommand[] = [
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

  describe('nodeToTag', () => {
    it('should convert a basic node to Tag', () => {
      const node = createMockNode({
        content: 'Development',
        properties: {
          legacyId: createProperty(42, 'legacyId'),
          color: createProperty('#ff0000', 'color'),
          icon: createProperty('code', 'icon'),
        },
      })

      const tag = nodeToTag(node)

      expect(tag.id).toBe(42)
      expect(tag.name).toBe('Development')
      expect(tag.color).toBe('#ff0000')
      expect(tag.icon).toBe('code')
    })

    it('should resolve parent via callback', () => {
      const node = createMockNode({
        content: 'Child Tag',
        properties: {
          legacyId: createProperty(2, 'legacyId'),
          parent: createProperty('parent-node-id', 'parent'),
        },
      })

      const tag = nodeToTag(node, {
        resolveParentId: (nodeId) => {
          expect(nodeId).toBe('parent-node-id')
          return 1
        },
      })

      expect(tag.parentId).toBe(1)
    })

    it('should return null parentId when no parent', () => {
      const node = createMockNode({
        content: 'Root Tag',
        properties: {
          legacyId: createProperty(1, 'legacyId'),
        },
      })

      const tag = nodeToTag(node)
      expect(tag.parentId).toBeNull()
    })

    it('should preserve timestamps', () => {
      const createdAt = new Date('2024-01-01')
      const updatedAt = new Date('2024-01-02')

      const node = createMockNode({
        content: 'Tag',
        createdAt,
        updatedAt,
      })

      const tag = nodeToTag(node)

      expect(tag.createdAt).toEqual(createdAt)
      expect(tag.updatedAt).toEqual(updatedAt)
    })
  })

  describe('nodeToCommand', () => {
    it('should convert a basic execute command', () => {
      const node = createMockNode({
        content: 'Build Project',
        properties: {
          commandId: createProperty('cmd-build', 'commandId'),
          description: createProperty('Build the entire project', 'description'),
          icon: createProperty('hammer', 'icon'),
          category: createProperty('build', 'category'),
          target: createProperty('item', 'target'),
          mode: createProperty('execute', 'mode'),
          command: createProperty('npm run build', 'command'),
          cwd: createProperty('/project', 'cwd'),
        },
      })

      const cmd = nodeToCommand(node)

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
          mode: createProperty('workflow', 'mode'),
          workflow: createProperty(workflowDefinition, 'workflow'),
        },
      })

      const cmd = nodeToCommand(node)

      expect(cmd.mode).toBe('workflow')
      expect(cmd.workflow).toEqual(workflowDefinition)
      expect(cmd.command).toBeUndefined()
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
          platforms: createProperty(['linux', 'macos'], 'platforms'),
        },
      })

      const cmd = nodeToCommand(node)

      expect(cmd.platforms).toEqual(['linux', 'macos'])
    })
  })

  describe('nodesToItems', () => {
    it('should convert multiple nodes with resolved references', () => {
      const nodes = [
        createMockNode({
          id: 'node-1',
          content: 'Item 1',
          systemId: 'item:item-1',
          supertags: [{ id: 'st-1', content: '#Item', systemId: 'supertag:item' }],
          properties: {
            tags: createProperty('tag-node-1', 'tags'),
          },
        }),
        createMockNode({
          id: 'node-2',
          content: 'Item 2',
          systemId: 'item:item-2',
          supertags: [{ id: 'st-1', content: '#Item', systemId: 'supertag:item' }],
        }),
      ]

      const tagLookup = new Map<string, TagRef>([
        ['tag-node-1', { id: 1, name: 'Tag One' }],
      ])

      const commandsByItemId = new Map<string, ItemCommand[]>([
        [
          'node-1',
          [
            {
              id: 'cmd-1',
              name: 'Run',
              icon: 'play',
              category: 'action',
              target: 'item',
              mode: 'execute',
              command: 'run',
            },
          ],
        ],
      ])

      const items = nodesToItems(nodes, tagLookup, commandsByItemId)

      expect(items).toHaveLength(2)
      expect(items[0].name).toBe('Item 1')
      expect(items[0].metadata.tags).toEqual([{ id: 1, name: 'Tag One' }])
      expect(items[0].commands).toHaveLength(1)
      expect(items[1].name).toBe('Item 2')
      expect(items[1].metadata.tags).toEqual([])
      expect(items[1].commands).toEqual([])
    })
  })
})
