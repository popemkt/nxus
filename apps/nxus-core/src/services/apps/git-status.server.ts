import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const GitStatusSchema = z.object({
  path: z.string(),
})

export interface GitStatus {
  isGitRepo: boolean
  gitInstalled: boolean
  hasRemote: boolean
  isUpToDate: boolean
  behindBy: number
  aheadBy: number
  currentBranch: string
  remoteBranch?: string
  error?: string
}

/**
 * Check git repository status including upstream comparison
 * @param path - Directory path to check
 * @returns GitStatus object with repository information
 */
export const checkGitStatusServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GitStatusSchema)
  .handler(async (ctx): Promise<GitStatus> => {
    console.log('[checkGitStatusServerFn] Input:', ctx.data)
    const { path } = ctx.data

    const defaultStatus: GitStatus = {
      isGitRepo: false,
      gitInstalled: false,
      hasRemote: false,
      isUpToDate: true,
      behindBy: 0,
      aheadBy: 0,
      currentBranch: '',
    }

    try {
      // 1. Check if git is installed
      try {
        await execAsync('git --version')
        defaultStatus.gitInstalled = true
      } catch {
        console.log('[checkGitStatusServerFn] Git not installed')
        return { ...defaultStatus, error: 'Git is not installed' }
      }

      // 2. Check if path is a git repository
      try {
        await execAsync('git rev-parse --git-dir', { cwd: path })
        defaultStatus.isGitRepo = true
      } catch {
        console.log('[checkGitStatusServerFn] Not a git repository:', path)
        return { ...defaultStatus, error: 'Not a git repository' }
      }

      // 3. Get current branch
      try {
        const { stdout } = await execAsync('git branch --show-current', {
          cwd: path,
        })
        defaultStatus.currentBranch = stdout.trim()
      } catch (error) {
        // Might be in detached HEAD state
        defaultStatus.currentBranch = 'HEAD'
      }

      // 4. Check if has remote
      try {
        const { stdout } = await execAsync('git remote -v', { cwd: path })
        defaultStatus.hasRemote = stdout.trim().length > 0
      } catch {
        console.log('[checkGitStatusServerFn] No remote:', path)
        return {
          ...defaultStatus,
          error: 'No remote repository configured',
        }
      }

      if (!defaultStatus.hasRemote) {
        console.log('[checkGitStatusServerFn] No remote:', path)
        return { ...defaultStatus, error: 'No remote repository configured' }
      }

      // 5. Get upstream branch
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref @{u}', {
          cwd: path,
        })
        defaultStatus.remoteBranch = stdout.trim()
      } catch {
        console.log('[checkGitStatusServerFn] No upstream configured:', path)
        return {
          ...defaultStatus,
          error: 'No upstream branch configured',
        }
      }

      // 6. Fetch latest from remote (quiet mode)
      try {
        await execAsync('git fetch --quiet', {
          cwd: path,
          timeout: 30000, // 30 second timeout
        })
      } catch (error) {
        console.warn('Git fetch failed:', error)
        // Continue anyway - we can still check with cached remote data
      }

      // 7. Check commits behind
      try {
        const { stdout: behindOutput } = await execAsync(
          'git rev-list HEAD..@{u} --count',
          { cwd: path },
        )
        defaultStatus.behindBy = parseInt(behindOutput.trim(), 10) || 0
      } catch {
        // If this fails, upstream might not exist
        defaultStatus.behindBy = 0
      }

      // 8. Check commits ahead (bonus info)
      try {
        const { stdout: aheadOutput } = await execAsync(
          'git rev-list @{u}..HEAD --count',
          { cwd: path },
        )
        defaultStatus.aheadBy = parseInt(aheadOutput.trim(), 10) || 0
      } catch {
        defaultStatus.aheadBy = 0
      }

      // 9. Determine if up to date
      defaultStatus.isUpToDate = defaultStatus.behindBy === 0

      console.log('[checkGitStatusServerFn] Success:', path, {
        isUpToDate: defaultStatus.isUpToDate,
        behindBy: defaultStatus.behindBy,
      })
      return defaultStatus
    } catch (error) {
      console.error('Git status check failed:', error)
      return {
        ...defaultStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

/**
 * Get the remote origin URL for a git repository
 * @param path - Directory path to check
 * @returns Object with remoteUrl and error if applicable
 */
export const getGitRemoteServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GitStatusSchema)
  .handler(async (ctx): Promise<{ remoteUrl?: string; error?: string }> => {
    const { path } = ctx.data

    try {
      const { stdout } = await execAsync('git remote get-url origin', {
        cwd: path,
      })
      return { remoteUrl: stdout.trim() }
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to get remote URL',
      }
    }
  })
