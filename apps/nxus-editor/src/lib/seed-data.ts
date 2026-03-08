import type { NodeMap, OutlineNode } from '@/types/outline'

function node(
  id: string,
  content: string,
  parentId: string | null,
  order: string,
  children: string[] = [],
  supertags: OutlineNode['supertags'] = [],
  collapsed = false,
): OutlineNode {
  return { id, content, parentId, order, children, collapsed, supertags, fields: [] }
}

export function seedDemoData(): NodeMap {
  const nodes: NodeMap = new Map()

  // Root workspace node
  nodes.set(
    'root',
    node('root', 'My Workspace', null, '00000000', [
      'n1',
      'n2',
      'n3',
      'n4',
    ]),
  )

  // Top-level nodes
  nodes.set(
    'n1',
    node('n1', 'Project Alpha', 'root', '00001000', ['n1a', 'n1b', 'n1c'], [
      { id: 'tag-project', name: 'project', color: '#6366f1' },
    ]),
  )
  nodes.set(
    'n2',
    node(
      'n2',
      'Weekly standup notes',
      'root',
      '00002000',
      ['n2a', 'n2b'],
      [{ id: 'tag-meeting', name: 'meeting', color: '#f59e0b' }],
    ),
  )
  nodes.set(
    'n3',
    node('n3', 'Reading list', 'root', '00003000', [
      'n3a',
      'n3b',
      'n3c',
    ]),
  )
  nodes.set('n4', node('n4', 'Random thoughts', 'root', '00004000'))

  // Project Alpha children
  nodes.set(
    'n1a',
    node('n1a', 'Set up CI/CD pipeline', 'n1', '00001000', ['n1a1', 'n1a2'], [
      { id: 'tag-task', name: 'task', color: '#10b981' },
    ]),
  )
  nodes.set(
    'n1b',
    node('n1b', 'Design the API schema', 'n1', '00002000', [], [
      { id: 'tag-task', name: 'task', color: '#10b981' },
    ]),
  )
  nodes.set(
    'n1c',
    node('n1c', 'Write unit tests for auth module', 'n1', '00003000', [], [
      { id: 'tag-task', name: 'task', color: '#10b981' },
    ]),
  )

  // Deeper nesting
  nodes.set(
    'n1a1',
    node('n1a1', 'Configure GitHub Actions workflow', 'n1a', '00001000'),
  )
  nodes.set(
    'n1a2',
    node(
      'n1a2',
      'Add Docker build step',
      'n1a',
      '00002000',
      ['n1a2a'],
    ),
  )
  nodes.set(
    'n1a2a',
    node('n1a2a', 'Need to decide between multi-stage and single-stage build', 'n1a2', '00001000'),
  )

  // Meeting notes children
  nodes.set(
    'n2a',
    node('n2a', 'Discussed migration timeline — aiming for end of Q1', 'n2', '00001000'),
  )
  nodes.set(
    'n2b',
    node('n2b', 'Action items from the call', 'n2', '00002000', [
      'n2b1',
      'n2b2',
    ]),
  )
  nodes.set(
    'n2b1',
    node('n2b1', 'Follow up with backend team on API versioning', 'n2b', '00001000', [], [
      { id: 'tag-task', name: 'task', color: '#10b981' },
    ]),
  )
  nodes.set(
    'n2b2',
    node('n2b2', 'Schedule design review for new dashboard', 'n2b', '00002000', [], [
      { id: 'tag-task', name: 'task', color: '#10b981' },
    ]),
  )

  // Reading list
  nodes.set(
    'n3a',
    node('n3a', 'Designing Data-Intensive Applications', 'n3', '00001000'),
  )
  nodes.set(
    'n3b',
    node('n3b', 'The Staff Engineer\'s Path', 'n3', '00002000'),
  )
  nodes.set(
    'n3c',
    node('n3c', 'Building a Second Brain', 'n3', '00003000'),
  )

  return nodes
}
