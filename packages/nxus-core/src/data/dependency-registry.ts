import { DEPENDENCY_IDS, type Dependency } from '@/types/dependency'

/**
 * Dependency registry - all known dependencies with their check configurations
 *
 * To add a new dependency:
 * 1. Add the ID to DEPENDENCY_IDS in types/dependency.ts
 * 2. Add the configuration here
 */
export const dependencyRegistry: Dependency[] = [
  {
    id: DEPENDENCY_IDS.GEMINI_CLI,
    name: 'Gemini CLI',
    description:
      'Google Gemini CLI for AI-powered operations like thumbnail generation',
    checkConfig: {
      type: 'cli-exists',
      command: 'gemini',
    },
    installInstructions:
      'Install with: npm install -g @anthropic-ai/claude-cli',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  {
    id: DEPENDENCY_IDS.POWERSHELL_CORE,
    name: 'PowerShell Core',
    description: 'Cross-platform PowerShell for running scripts',
    checkConfig: {
      type: 'cli-exists',
      command: 'pwsh',
    },
    installInstructions:
      'Install from your package manager (apt, brew) or download from GitHub',
    installUrl: 'https://github.com/PowerShell/PowerShell',
  },
  {
    id: DEPENDENCY_IDS.GIT,
    name: 'Git',
    description: 'Version control system for cloning repositories',
    checkConfig: {
      type: 'cli-exists',
      command: 'git',
    },
    installInstructions:
      'Install from your package manager (apt install git, brew install git)',
    installUrl: 'https://git-scm.com/downloads',
  },
  {
    id: DEPENDENCY_IDS.PYTHON3,
    name: 'Python 3',
    description: 'Python interpreter for running OpenRecall and related tools',
    checkConfig: {
      type: 'cli-exists',
      command: 'python3',
    },
    installInstructions:
      'Install from python.org or your package manager (apt install python3, brew install python)',
    installUrl: 'https://www.python.org/downloads/',
  },
]

/**
 * Get a dependency by ID
 */
export function getDependency(id: string): Dependency | undefined {
  return dependencyRegistry.find((d) => d.id === id)
}

/**
 * Get multiple dependencies by IDs
 */
export function getDependencies(ids: string[]): Dependency[] {
  return ids
    .map((id) => getDependency(id))
    .filter((d): d is Dependency => d !== undefined)
}
