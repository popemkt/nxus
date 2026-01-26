import { describe, expect, it } from 'vitest'
import { getPlatformCommands } from './platform-commands'

describe('platform-commands', () => {
  it('should generate safe command for opening folder with malicious input', () => {
    const commands = getPlatformCommands()
    const maliciousPath = 'foo"; rm -rf /; echo "'

    const command = commands.openFolder(maliciousPath)
    console.log('Generated command:', command)

    // Basic check: the malicious command chain characters should be quoted or sanitized

    if (command.startsWith('xdg-open') || (command.startsWith('open') && !command.includes('Terminal'))) {
       // POSIX (Linux/Darwin openFolder)
       // Should be wrapped in single quotes: 'foo"; rm -rf /; echo "'
       // The double quote inside remains as is, but inside single quotes it's safe.
       expect(command).toContain(`'${maliciousPath}'`)
    } else if (command.startsWith('start')) {
       // Win32
       // Should sanitize quotes: foo; rm -rf /; echo
       // And wrap in double quotes: "foo; rm -rf /; echo "
       const sanitized = maliciousPath.replace(/"/g, '')
       expect(command).toContain(`"${sanitized}"`)
       expect(command).not.toContain('";')
    }
  })

  it('should generate safe command for openTerminal with malicious path', () => {
     const commands = getPlatformCommands()
     const maliciousPath = 'foo"; rm -rf /; echo "'
     const command = commands.openTerminal(maliciousPath)
     console.log('Terminal command:', command)

     // Should not allow breaking out of quotes
     if (command.includes('xdg-terminal') || command.includes('gnome-terminal')) {
        expect(command).toContain(`'${maliciousPath}'`)
     } else if (command.startsWith('open -a Terminal')) {
        expect(command).toContain(`'${maliciousPath}'`)
     } else if (command.startsWith('start cmd')) {
        const sanitized = maliciousPath.replace(/"/g, '')
        expect(command).toContain(`"${sanitized}"`)
     }
  })
})
