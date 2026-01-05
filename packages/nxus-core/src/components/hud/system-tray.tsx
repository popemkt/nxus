import { useOsInfo, useDevInfo } from '@/services/state/app-state'
import {
  WindowsLogo,
  AppleLogo,
  LinuxLogo,
  Desktop,
} from '@phosphor-icons/react'

interface SystemTrayProps {
  className?: string
}

/**
 * System tray component displayed in the bottom-right corner.
 */
export function SystemTray({ className }: SystemTrayProps) {
  const osInfo = useOsInfo()
  const devInfo = useDevInfo()

  const getOsIcon = () => {
    if (!osInfo) return <Desktop className="size-3" weight="fill" />
    switch (osInfo.platform) {
      case 'windows':
        return <WindowsLogo className="size-3" weight="fill" />
      case 'macos':
        return <AppleLogo className="size-3" weight="fill" />
      case 'linux':
        return <LinuxLogo className="size-3" weight="fill" />
      default:
        return <Desktop className="size-3" weight="fill" />
    }
  }

  const getOsLabel = () => {
    if (!osInfo) return 'Loading...'
    const platformName =
      osInfo.platform.charAt(0).toUpperCase() + osInfo.platform.slice(1)
    return platformName
  }

  return (
    <div className="fixed bottom-5 right-5 flex items-center gap-3 px-3.5 py-2 bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-full z-40 text-[11px] text-foreground/50 transition-all hover:bg-background hover:border-foreground/15">
      {/* Dev Mode indicator */}
      {devInfo?.isDevMode && (
        <>
          <div className="flex items-center gap-1.5 text-red-500">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>Dev</span>
          </div>
          <div className="w-px h-3 bg-foreground/10" />
        </>
      )}

      {/* OS indicator */}
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {getOsIcon()}
        <span>{getOsLabel()}</span>
      </div>
    </div>
  )
}
