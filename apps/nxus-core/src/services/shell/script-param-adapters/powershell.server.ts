import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import type {
  ParseScriptParamsResult,
  ScriptParam,
  ScriptParamType,
} from './types'

const execAsync = promisify(exec)

/**
 * PowerShell script to extract parameters as JSON
 */
const POWERSHELL_PARAM_PARSER = `
$cmd = Get-Command -Name "{SCRIPT_PATH}"
$params = $cmd.Parameters.GetEnumerator() | ForEach-Object {
  $param = $_.Value
  $validateSet = $param.Attributes | Where-Object { $_.TypeId.Name -eq 'ValidateSetAttribute' }
  $paramAttr = $param.Attributes | Where-Object { $_.TypeId.Name -eq 'ParameterAttribute' }
  
  @{
    Name = $_.Key
    Type = $param.ParameterType.Name
    IsMandatory = if ($paramAttr) { $paramAttr.Mandatory } else { $false }
    HasDefault = $param.Attributes.DefaultValue -ne $null
    DefaultValue = $param.Attributes.DefaultValue
    ValidateSet = if ($validateSet) { $validateSet.ValidValues } else { $null }
    HelpMessage = if ($paramAttr) { $paramAttr.HelpMessage } else { $null }
  }
} | Where-Object { $_.Name -notin @('Verbose', 'Debug', 'ErrorAction', 'WarningAction', 'InformationAction', 'ErrorVariable', 'WarningVariable', 'InformationVariable', 'OutVariable', 'OutBuffer', 'PipelineVariable', 'ProgressAction') }

$params | ConvertTo-Json -Depth 3
`

/**
 * Map PowerShell type to UI type
 */
function mapPowerShellType(
  typeName: string,
  paramName: string,
  validateSet: Array<string> | null,
): ScriptParamType {
  // If has ValidateSet, it's a select
  if (validateSet && validateSet.length > 0) {
    return 'select'
  }

  // Check if param name suggests a path
  const pathKeywords = [
    'path',
    'folder',
    'directory',
    'dir',
    'file',
    'location',
  ]
  const lowerName = paramName.toLowerCase()
  if (pathKeywords.some((kw) => lowerName.includes(kw))) {
    return 'path'
  }

  // Map by type name
  switch (typeName) {
    case 'SwitchParameter':
    case 'Boolean':
      return 'boolean'
    case 'Int32':
    case 'Int64':
    case 'Double':
    case 'Decimal':
      return 'number'
    default:
      return 'string'
  }
}

const ParseParamsSchema = z.object({
  scriptPath: z.string(),
})

/**
 * Parse PowerShell script parameters
 */
export const parsePowerShellParamsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ParseParamsSchema)
  .handler(async (ctx): Promise<ParseScriptParamsResult> => {
    console.log('[parsePowerShellParamsServerFn] Input:', ctx.data)
    const { scriptPath } = ctx.data

    let tempFile = ''
    try {
      const psScript = POWERSHELL_PARAM_PARSER.replace(
        '{SCRIPT_PATH}',
        scriptPath,
      )

      // Write to temp file to avoid shell interpolation issues with special chars
      tempFile = path.join(os.tmpdir(), `nxus-param-parser-${Date.now()}.ps1`)
      await fs.writeFile(tempFile, psScript)

      const { stdout, stderr } = await execAsync(
        `pwsh -NoProfile -File "${tempFile}"`,
      )

      // Cleanup
      await fs.unlink(tempFile).catch(() => {})

      if (stderr && !stdout) {
        console.error('[parsePowerShellParamsServerFn] Stderr:', stderr)
        return { success: false, error: stderr }
      }

      // Parse the JSON output
      const rawParams = JSON.parse(stdout.trim() || '[]')

      // Ensure it's always an array
      const paramsArray = Array.isArray(rawParams) ? rawParams : [rawParams]

      const params: Array<ScriptParam> = paramsArray.map(
        (p: {
          Name: string
          Type: string
          IsMandatory: boolean
          HasDefault: boolean
          DefaultValue: unknown
          ValidateSet: Array<string> | null
          HelpMessage: string | null
        }) => ({
          name: p.Name,
          type: mapPowerShellType(p.Type, p.Name, p.ValidateSet),
          required: p.IsMandatory,
          defaultValue: p.HasDefault ? (p.DefaultValue as any) : undefined,
          options: p.ValidateSet ?? undefined,
          description: p.HelpMessage ?? undefined,
        }),
      )

      console.log(
        '[parsePowerShellParamsServerFn] Success:',
        scriptPath,
        params.length,
      )
      return { success: true, params }
    } catch (error) {
      console.error('[parsePowerShellParamsServerFn] Failed:', error)
      // Cleanup on error
      if (tempFile) {
        await fs.unlink(tempFile).catch(() => {})
      }
      return {
        success: false,
        error: `Failed to parse script parameters: ${(error as Error).message}`,
      }
    }
  })
