export interface MiniApp {
  id: string
  name: string
  description: string
  icon: 'cube' | 'graph' | 'calendar' | 'brain'
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
      'Spaced repetition learning with AI-generated concepts and adaptive review sessions.',
    icon: 'brain',
    path: '/recall',
  },
]
