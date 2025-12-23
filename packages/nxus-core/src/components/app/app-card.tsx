import type { App } from '@/types/app'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FileIcon,
  CodeIcon,
  FolderOpenIcon,
  TerminalWindowIcon,
  DotsThreeVerticalIcon,
} from '@phosphor-icons/react'
import { AppActionsDialog } from './app-actions-dialog'

interface AppCardProps {
  app: App
  onOpen?: (app: App) => void
  onInstall?: (app: App) => void
}

const APP_TYPE_ICONS = {
  html: FileIcon,
  typescript: CodeIcon,
  'remote-repo': FolderOpenIcon,
  'script-tool': TerminalWindowIcon,
}

const APP_TYPE_LABELS = {
  html: 'HTML',
  typescript: 'TypeScript',
  'remote-repo': 'Repository',
  'script-tool': 'Script',
}

const STATUS_VARIANTS = {
  installed: 'default',
  'not-installed': 'secondary',
  available: 'outline',
} as const

export function AppCard({ app, onOpen }: AppCardProps) {
  const TypeIcon = APP_TYPE_ICONS[app.type]

  return (
    <Card className="flex flex-col overflow-hidden transition-all hover:ring-2 hover:ring-primary/20">
      {app.thumbnail && (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={app.thumbnail}
            alt={app.name}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1">{app.name}</CardTitle>
          <TypeIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
        <CardDescription className="line-clamp-2">
          {app.description}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant={STATUS_VARIANTS[app.status]}>
            {app.status.replace('-', ' ')}
          </Badge>
          <Badge variant="secondary">{APP_TYPE_LABELS[app.type]}</Badge>
          {app.metadata.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {app.metadata.tags.length > 2 && (
            <Badge variant="outline">+{app.metadata.tags.length - 2}</Badge>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <AppActionsDialog
          app={app}
          onOpen={onOpen}
          trigger={
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
            >
              <DotsThreeVerticalIcon className="h-5 w-5" />
              Actions
            </Button>
          }
        />
      </CardFooter>
    </Card>
  )
}
