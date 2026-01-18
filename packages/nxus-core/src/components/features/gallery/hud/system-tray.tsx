import { useOsInfo, useDevInfo } from '@/services/state/app-state'
import {
  WindowsLogoIcon,
  AppleLogoIcon,
  LinuxLogoIcon,
  DesktopIcon,
} from '@phosphor-icons/react'

interface SystemTrayProps {
  className?: string
}

/**
 * System tray component displayed in the bottom-right corner.
 */
export function SystemTray({ className: _className }: SystemTrayProps) {
  const osInfo = useOsInfo()
  const devInfo = useDevInfo()

  const getOsIcon = () => {
    if (!osInfo) return <DesktopIcon className="size-3" weight="fill" />
    switch (osInfo.platform) {
      case 'windows':
        return <WindowsLogoIcon className="size-3" weight="fill" />
      case 'macos':
        return <AppleLogoIcon className="size-3" weight="fill" />
      case 'linux':
        return <LinuxLogoIcon className="size-3" weight="fill" />
      default:
        return <DesktopIcon className="size-3" weight="fill" />
    }
  }

  const getOsLabel = () => {
    if (!osInfo) return 'Loading...'
    const platformName =
      osInfo.platform.charAt(0).toUpperCase() + osInfo.platform.slice(1)
    return platformName
  }

  return (
    <div className="fixed bottom-5 right-5 flex items-center gap-3 px-3.5 py-2 bg-background/80 backdrop-blur-xl border border-foreground/10 radius-button z-40 text-[11px] text-foreground/50 transition-all hover:bg-background hover:border-foreground/15">
      {/* Dev Mode indicator */}
      {devInfo?.isDevMode && (
        <>
          <div className="flex items-center gap-1.5 text-primary font-bold">
            <div className="w-1.5 h-1.5 radius-button bg-primary" />
            <span>Dev</span>
          </div>
          <div className="w-px h-3 bg-foreground/10" />
        </>
      )}

      {/* OS indicator */}
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 radius-button bg-chart-5" />
        {getOsIcon()}
        <span>{getOsLabel()}</span>
      </div>
    </div>
  )
}
