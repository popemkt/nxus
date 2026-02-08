import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Badge, Button , cn  } from '@nxus/ui'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
} from '@phosphor-icons/react'
import type {SortingState} from '@tanstack/react-table';
import type { Item } from '@nxus/db'
import {
  STATUS_VARIANTS,
} from '@/lib/app-constants'
import { TypeBadgesList } from '../type-badges-list'
import { TruncatedTagsList } from '../truncated-tags-list'
import { ItemHealthBadge } from '../item-health-badge'

interface TableViewProps {
  items: Array<Item>
}

const columnHelper = createColumnHelper<Item>()


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
      columnHelper.accessor('types', {
        header: 'Type',
        cell: (info) => (
          <div className="flex items-center gap-1">
            <TypeBadgesList item={{ types: info.getValue() }} showIcons className="text-xs" />
          </div>
        ),
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
        cell: (info) => <ItemHealthBadge app={info.row.original} />,
      }),
      columnHelper.accessor((row) => row.metadata.tags, {
        id: 'tags',
        header: 'Tags',
        cell: (info) => (
          <div className="flex flex-wrap gap-1">
            <TruncatedTagsList tags={info.getValue()} limit={3} className="text-xs" />
          </div>
        ),
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
