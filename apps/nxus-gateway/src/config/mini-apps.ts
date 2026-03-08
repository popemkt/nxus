export interface MiniApp {
  id: string
  name: string
  description: string
  icon: 'cube' | 'graph' | 'calendar' | 'brain' | 'notepad'
  path: string
}

export const miniApps: MiniApp[] = [
  {
    id: 'nxus-core',
    name: 'nXus Core',
    description:
      'Central hub for managing applications, dependencies, and system configuration.',
    icon: 'cube',
    path: '/core',
  },
  {
    id: 'nxus-workbench',
    name: 'nXus Workbench',
    description:
      'Visual node editor for building and exploring graph-based workflows.',
    icon: 'graph',
    path: '/workbench',
  },
  {
    id: 'nxus-calendar',
    name: 'nXus Calendar',
    description:
      'Calendar and schedule management with event tracking and Google Calendar sync.',
    icon: 'calendar',
    path: '/calendar',
  },
  {
    id: 'nxus-recall',
    name: 'nXus Recall',
    description:
      'AI-powered spaced repetition for higher-order learning with dynamic question generation.',
    icon: 'brain',
    path: '/recall',
  },
  {
    id: 'nxus-editor',
    name: 'nXus Editor',
    description:
      'Outline editor for creating, organizing, and navigating nodes as an infinitely nested document.',
    icon: 'notepad',
    path: '/editor',
  },
]
