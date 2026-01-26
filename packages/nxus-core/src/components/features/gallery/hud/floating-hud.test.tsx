// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FloatingHud } from './floating-hud'

// Mock dependencies
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  LayoutGroup: ({ children }: any) => <div>{children}</div>,
  AnimatePresence: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@nxus/ui', async () => {
  const actual = await vi.importActual('@nxus/ui')
  return {
    ...actual,
    cn: (...args: any[]) => args.join(' '),
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuCheckboxItem: ({ children }: any) => <div>{children}</div>,
  }
})

// Mock stores
vi.mock('@/stores/view-mode.store', () => ({
  useViewModeStore: (selector: any) => {
    const state = {
      viewMode: 'gallery',
      galleryMode: 'default',
      setViewMode: vi.fn(),
      setGalleryMode: vi.fn(),
    }
    return selector(state)
  }
}))

vi.mock('@/stores/command-palette.store', () => ({
  useCommandPaletteStore: (selector: any) => {
    const state = {
      isOpen: false,
      open: vi.fn(),
    }
    return selector(state)
  }
}))

describe('FloatingHud Accessibility', () => {
  const defaultProps = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    sidebarOpen: false,
    onSidebarToggle: vi.fn(),
    inboxCount: 0,
  }

  it('has accessible search input', () => {
    render(<FloatingHud {...defaultProps} />)
    const searchInputs = screen.getAllByLabelText('Search apps')
    expect(searchInputs.length).toBeGreaterThan(0)
  })

  it('has accessible command palette button', () => {
    render(<FloatingHud {...defaultProps} />)
    const cmdButtons = screen.getAllByLabelText('Open command palette (Command+K)')
    expect(cmdButtons.length).toBeGreaterThan(0)
  })

  it('has accessible sidebar toggle button', () => {
    render(<FloatingHud {...defaultProps} />)
    const toggleButtons = screen.getAllByLabelText('Toggle tags sidebar')
    expect(toggleButtons.length).toBeGreaterThan(0)
    expect(toggleButtons[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('has accessible view mode buttons', () => {
    render(<FloatingHud {...defaultProps} />)

    const tableViewButtons = screen.getAllByLabelText('Switch to table view')
    expect(tableViewButtons.length).toBeGreaterThan(0)
    expect(tableViewButtons[0].getAttribute('aria-pressed')).toBe('false')

    const graphViewButtons = screen.getAllByLabelText('Switch to graph view')
    expect(graphViewButtons.length).toBeGreaterThan(0)
    expect(graphViewButtons[0].getAttribute('aria-pressed')).toBe('false')

    const galleryViewButtons = screen.getAllByLabelText('Switch to gallery view')
    expect(galleryViewButtons.length).toBeGreaterThan(0)
    expect(galleryViewButtons[0].getAttribute('aria-pressed')).toBe('true')
  })

  it('has accessible links', () => {
    render(<FloatingHud {...defaultProps} />)

    const inboxLinks = screen.getAllByRole('link', { name: 'Go to Inbox' })
    expect(inboxLinks.length).toBeGreaterThan(0)

    const settingsLinks = screen.getAllByRole('link', { name: 'Go to Settings' })
    expect(settingsLinks.length).toBeGreaterThan(0)
  })
})
