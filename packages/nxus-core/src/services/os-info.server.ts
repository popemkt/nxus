import { createServerFn } from '@tanstack/react-start'
import os from 'node:os'

export type OSType = 'windows' | 'darwin' | 'linux' | 'unknown'

export const getOSInfoServerFn = createServerFn({ method: 'GET' }).handler(
    async () => {
        const platform = os.platform()

        let osType: OSType = 'unknown'
        if (platform === 'win32') {
            osType = 'windows'
        } else if (platform === 'darwin') {
            osType = 'darwin'
        } else if (platform === 'linux') {
            osType = 'linux'
        }

        return {
            osType,
            platform,
        }
    },
)
