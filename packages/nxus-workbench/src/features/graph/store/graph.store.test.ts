import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_DISPLAY,
  DEFAULT_FILTER,
  DEFAULT_LOCAL_GRAPH,
  DEFAULT_PHYSICS,
  DEFAULT_VIEW,
  graphStoreService,
  useGraphStore,
} from './index'

describe('Graph Store', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useGraphStore.setState({
      physics: { ...DEFAULT_PHYSICS },
      display: { ...DEFAULT_DISPLAY },
      filter: { ...DEFAULT_FILTER },
      localGraph: { ...DEFAULT_LOCAL_GRAPH },
      view: { ...DEFAULT_VIEW },
    })
  })

  describe('Initial State', () => {
    it('should initialize with default physics values', () => {
      const state = useGraphStore.getState()
      expect(state.physics.centerForce).toBe(0.5)
      expect(state.physics.repelForce).toBe(200)
      expect(state.physics.linkForce).toBe(0.4)
      expect(state.physics.linkDistance).toBe(100)
    })

    it('should initialize with default display values', () => {
      const state = useGraphStore.getState()
      expect(state.display.colorBy).toBe('supertag')
      expect(state.display.nodeLabels).toBe('hover')
      expect(state.display.edgeLabels).toBe('never')
      expect(state.display.nodeSize).toBe('connections')
      expect(state.display.edgeStyle).toBe('animated')
    })

    it('should initialize with default filter values', () => {
      const state = useGraphStore.getState()
      expect(state.filter.includeTags).toBe(false)
      expect(state.filter.includeRefs).toBe(true)
      expect(state.filter.includeHierarchy).toBe(true)
      expect(state.filter.showOrphans).toBe(true)
      expect(state.filter.supertagFilter).toEqual([])
      expect(state.filter.searchQuery).toBe('')
    })

    it('should initialize with default local graph values', () => {
      const state = useGraphStore.getState()
      expect(state.localGraph.enabled).toBe(false)
      expect(state.localGraph.focusNodeId).toBeNull()
      expect(state.localGraph.depth).toBe(1)
      expect(state.localGraph.linkTypes).toEqual(['outgoing', 'incoming'])
    })

    it('should initialize with default view values', () => {
      const state = useGraphStore.getState()
      expect(state.view.renderer).toBe('2d')
      expect(state.view.layout).toBe('force')
    })
  })

  describe('setPhysics', () => {
    it('should update physics options partially', () => {
      useGraphStore.getState().setPhysics({ centerForce: 0.8 })

      const state = useGraphStore.getState()
      expect(state.physics.centerForce).toBe(0.8)
      expect(state.physics.repelForce).toBe(200) // Unchanged
    })

    it('should update multiple physics options', () => {
      useGraphStore.getState().setPhysics({
        centerForce: 0.3,
        linkDistance: 150,
      })

      const state = useGraphStore.getState()
      expect(state.physics.centerForce).toBe(0.3)
      expect(state.physics.linkDistance).toBe(150)
    })
  })

  describe('setDisplay', () => {
    it('should update display options partially', () => {
      useGraphStore.getState().setDisplay({ colorBy: 'type' })

      const state = useGraphStore.getState()
      expect(state.display.colorBy).toBe('type')
      expect(state.display.nodeLabels).toBe('hover') // Unchanged
    })

    it('should update edge style', () => {
      useGraphStore.getState().setDisplay({ edgeStyle: 'solid' })

      const state = useGraphStore.getState()
      expect(state.display.edgeStyle).toBe('solid')
    })
  })

  describe('setFilter', () => {
    it('should update filter options partially', () => {
      useGraphStore.getState().setFilter({ includeTags: true })

      const state = useGraphStore.getState()
      expect(state.filter.includeTags).toBe(true)
      expect(state.filter.includeRefs).toBe(true) // Unchanged
    })

    it('should update supertag filter', () => {
      useGraphStore.getState().setFilter({
        supertagFilter: ['tag1', 'tag2'],
      })

      const state = useGraphStore.getState()
      expect(state.filter.supertagFilter).toEqual(['tag1', 'tag2'])
    })

    it('should update search query', () => {
      useGraphStore.getState().setFilter({ searchQuery: 'test query' })

      const state = useGraphStore.getState()
      expect(state.filter.searchQuery).toBe('test query')
    })
  })

  describe('setLocalGraph', () => {
    it('should enable local graph with focus node', () => {
      useGraphStore.getState().setLocalGraph({
        enabled: true,
        focusNodeId: 'node-123',
      })

      const state = useGraphStore.getState()
      expect(state.localGraph.enabled).toBe(true)
      expect(state.localGraph.focusNodeId).toBe('node-123')
    })

    it('should update depth', () => {
      useGraphStore.getState().setLocalGraph({ depth: 2 })

      const state = useGraphStore.getState()
      expect(state.localGraph.depth).toBe(2)
    })

    it('should update link types', () => {
      useGraphStore.getState().setLocalGraph({ linkTypes: ['outgoing'] })

      const state = useGraphStore.getState()
      expect(state.localGraph.linkTypes).toEqual(['outgoing'])
    })
  })

  describe('setView', () => {
    it('should switch to 3D renderer', () => {
      useGraphStore.getState().setView({ renderer: '3d' })

      const state = useGraphStore.getState()
      expect(state.view.renderer).toBe('3d')
    })

    it('should switch to hierarchical layout', () => {
      useGraphStore.getState().setView({ layout: 'hierarchical' })

      const state = useGraphStore.getState()
      expect(state.view.layout).toBe('hierarchical')
    })
  })

  describe('resetToDefaults', () => {
    it('should reset all options to defaults', () => {
      // Modify all options
      useGraphStore.getState().setPhysics({ centerForce: 0.1 })
      useGraphStore.getState().setDisplay({ colorBy: 'none' })
      useGraphStore.getState().setFilter({ includeTags: true })
      useGraphStore.getState().setLocalGraph({ enabled: true, depth: 3 })
      useGraphStore.getState().setView({ renderer: '3d' })

      // Reset
      useGraphStore.getState().resetToDefaults()

      // Verify all reset
      const state = useGraphStore.getState()
      expect(state.physics.centerForce).toBe(0.5)
      expect(state.display.colorBy).toBe('supertag')
      expect(state.filter.includeTags).toBe(false)
      expect(state.localGraph.enabled).toBe(false)
      expect(state.view.renderer).toBe('2d')
    })
  })

  describe('graphStoreService', () => {
    it('should get state imperatively', () => {
      const state = graphStoreService.getState()
      expect(state.physics.centerForce).toBe(0.5)
    })

    it('should set physics imperatively', () => {
      graphStoreService.setPhysics({ repelForce: 300 })

      expect(graphStoreService.getPhysics().repelForce).toBe(300)
    })

    it('should enable local graph', () => {
      graphStoreService.enableLocalGraph('node-456')

      const localGraph = graphStoreService.getLocalGraph()
      expect(localGraph.enabled).toBe(true)
      expect(localGraph.focusNodeId).toBe('node-456')
    })

    it('should disable local graph', () => {
      graphStoreService.enableLocalGraph('node-456')
      graphStoreService.disableLocalGraph()

      const localGraph = graphStoreService.getLocalGraph()
      expect(localGraph.enabled).toBe(false)
      expect(localGraph.focusNodeId).toBeNull()
    })

    it('should toggle renderer', () => {
      expect(graphStoreService.getView().renderer).toBe('2d')

      graphStoreService.toggleRenderer()
      expect(graphStoreService.getView().renderer).toBe('3d')

      graphStoreService.toggleRenderer()
      expect(graphStoreService.getView().renderer).toBe('2d')
    })

    it('should set focus node', () => {
      graphStoreService.setFocusNode('node-789')

      expect(graphStoreService.getLocalGraph().focusNodeId).toBe('node-789')
    })
  })
})
