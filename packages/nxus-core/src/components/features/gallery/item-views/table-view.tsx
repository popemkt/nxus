import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import type { Item } from '@/types/item'
import { Badge } from '@nxus/ui'
import { Button } from '@nxus/ui'
import {
  ArrowUp,
  ArrowDown,
  ArrowRight,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react'
import {
  APP_TYPE_ICONS,
  APP_TYPE_LABELS_SHORT,
  STATUS_VARIANTS,
} from '@/lib/app-constants'
import { useToolHealth } from '@/hooks/use-tool-health'
import { cn } from '@nxus/ui'

interface TableViewProps {
  items: Item[]
}

const columnHelper = createColumnHelper<Item>()

// Cell component for health status - uses TanStack Query via domain hook
function HealthCell({ app }: { app: Item }) {
  const isTool = app.type === 'tool'
  const hasCheckCommand = isTool && 'checkCommand' in app && !!app.checkCommand
  const healthCheck = useToolHealth(app, hasCheckCommand)

  if (!hasCheckCommand) return null

  if (healthCheck.isLoading) {
    return (
      <Badge variant="outline" className="animate-pulse">
        Checking...
      </Badge>
    )
  }

  return (
    <Badge
      variant={healthCheck.isInstalled ? 'default' : 'destructive'}
      className="flex items-center gap-1"
    >
      {healthCheck.isInstalled ? (
        <>
          <CheckCircle className="h-3 w-3" weight="fill" />
          {healthCheck.version || 'Installed'}
        </>
      ) : (
        <>
          <XCircle className="h-3 w-3" weight="fill" />
          Not Found
        </>
      )}
    </Badge>
  )
}

export function TableView({ items }: TableViewProps) {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <div className="flex items-center gap-2 font-medium">
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (info) => {
          const type = info.getValue()
          const TypeIcon = APP_TYPE_ICONS[type]
          return (
            <div className="flex items-center gap-2">
              <TypeIcon className="h-4 w-4 text-muted-foreground" />
              <span>{APP_TYPE_LABELS_SHORT[type]}</span>
            </div>
          )
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => (
          <Badge variant={STATUS_VARIANTS[info.getValue()]}>
            {info.getValue().replace('-', ' ')}
          </Badge>
        ),
      }),
      columnHelper.display({
        id: 'health',
        header: 'Health',
        cell: (info) => <HealthCell app={info.row.original} />,
      }),
      columnHelper.accessor((row) => row.metadata.tags, {
        id: 'tags',
        header: 'Tags',
        cell: (info) => {
          const tags = info.getValue()
          if (!tags || tags.length === 0) return null
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )
        },
        enableSorting: false,
      }),
      columnHelper.accessor('dependencies', {
        header: 'Dependencies',
        cell: (info) => {
          const deps = info.getValue()
          if (!deps || deps.length === 0)
            return <span className="text-muted-foreground">—</span>
          return (
            <Badge variant="secondary" className="text-xs">
              {deps.length} dep{deps.length !== 1 ? 's' : ''}
            </Badge>
          )
        },
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <Link to="/apps/$appId" params={{ appId: info.row.original.id }}>
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ),
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleRowDoubleClick = (appId: string) => {
    navigate({ to: '/apps/$appId', params: { appId } })
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left text-sm font-medium text-muted-foreground',
                      header.column.getCanSort() &&
                        'cursor-pointer select-none hover:text-foreground',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getIsSorted() === 'asc' && (
                        <ArrowUp className="h-3 w-3" />
                      )}
                      {header.column.getIsSorted() === 'desc' && (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No items found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onDoubleClick={() => handleRowDoubleClick(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
