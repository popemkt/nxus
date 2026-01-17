import {
  getEphemeralDatabase,
  saveEphemeralDatabase,
  initEphemeralDatabase,
} from '@/db/client'
import { healthCache } from '@/db/ephemeral-schema'
import { eq } from 'drizzle-orm'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface ToolHealthResult {
  isInstalled: boolean
  version?: string
  error?: string
}

/**
 * Service for managing tool health checks with ephemeral DB caching
 * Shared between server functions and API routes for consistent behavior
 */
export class ToolHealthService {
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  /**
   * Check tool status with caching
   * @param toolId - Unique identifier for the tool (e.g., app ID)
   * @param checkCommand - Shell command to check tool installation
   * @returns Tool health status
   */
  async checkToolStatus(
    toolId: string,
    checkCommand: string,
  ): Promise<ToolHealthResult> {
    console.log('[ToolHealthService] Checking tool:', toolId, checkCommand)

    // Ensure ephemeral database is initialized
    initEphemeralDatabase()

    // 1. Try to get cached result
    const cached = await this.getCachedHealth(toolId)
    if (cached) {
      console.log('[ToolHealthService] Using cached result for:', toolId)
      return {
        isInstalled: cached.status === 'healthy',
        version: cached.version ?? undefined,
        error: cached.error ?? undefined,
      }
    }

    // 2. Run fresh check
    console.log('[ToolHealthService] Running fresh check for:', toolId)
    const result = await this.runCheckCommand(checkCommand)

    // 3. Cache the result
    await this.cacheHealth(toolId, result)

    return result
  }

  /**
   * Get cached health status if not expired
   */
  private async getCachedHealth(toolId: string) {
    try {
      const db = getEphemeralDatabase()

      const [cached] = await db
        .select()
        .from(healthCache)
        .where(eq(healthCache.toolId, toolId))

      if (!cached) {
        return null
      }

      // Check if expired
      const now = new Date()
      if (now >= cached.expiresAt) {
        console.log('[ToolHealthService] Cache expired for:', toolId)
        return null
      }

      return cached
    } catch (error) {
      console.error('[ToolHealthService] Error reading cache:', error)
      return null
    }
  }

  /**
   * Cache health status to ephemeral database
   */
  private async cacheHealth(toolId: string, result: ToolHealthResult) {
    try {
      const db = getEphemeralDatabase()

      const now = new Date()
      const expiresAt = new Date(now.getTime() + this.CACHE_TTL_MS)

      await db
        .insert(healthCache)
        .values({
          toolId,
          status: result.isInstalled ? 'healthy' : 'unhealthy',
          version: result.version ?? null,
          error: result.error ?? null,
          checkedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: healthCache.toolId,
          set: {
            status: result.isInstalled ? 'healthy' : 'unhealthy',
            version: result.version ?? null,
            error: result.error ?? null,
            checkedAt: now,
            expiresAt,
          },
        })

      saveEphemeralDatabase()
      console.log('[ToolHealthService] Cached result for:', toolId)
    } catch (error) {
      console.error('[ToolHealthService] Error caching health:', error)
      // Don't throw - caching failure shouldn't break the check
    }
  }

  /**
   * Run the actual check command
   */
  private async runCheckCommand(
    checkCommand: string,
  ): Promise<ToolHealthResult> {
    try {
      const { stdout, stderr } = await execAsync(checkCommand, {
        timeout: 5000, // 5 second timeout
      })

      const output = stdout.trim() || stderr.trim()
      return {
        isInstalled: true,
        version: output,
      }
    } catch (error: any) {
      return {
        isInstalled: false,
        error: error.message,
      }
    }
  }

  /**
   * Clear cache for a specific tool (useful for testing or manual refresh)
   */
  async clearCache(toolId: string): Promise<void> {
    try {
      const db = getEphemeralDatabase()
      await db.delete(healthCache).where(eq(healthCache.toolId, toolId))
      saveEphemeralDatabase()
      console.log('[ToolHealthService] Cleared cache for:', toolId)
    } catch (error) {
      console.error('[ToolHealthService] Error clearing cache:', error)
    }
  }

  /**
   * Clear all cached health statuses
   */
  async clearAllCaches(): Promise<void> {
    try {
      const db = getEphemeralDatabase()
      await db.delete(healthCache)
      saveEphemeralDatabase()
      console.log('[ToolHealthService] Cleared all health caches')
    } catch (error) {
      console.error('[ToolHealthService] Error clearing all caches:', error)
    }
  }
}

/**
 * Singleton instance of the tool health service
 */
export const toolHealthService = new ToolHealthService()
