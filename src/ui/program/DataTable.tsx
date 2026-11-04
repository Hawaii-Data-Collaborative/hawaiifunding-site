import { Fragment, useMemo, useState } from 'react'
import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Tooltip } from '@mui/material'

/**
 * The table used by the Grants / CIP / Contracts / Documents sections.
 *
 * Kept deliberately thin — it's four static tables, not a grid — but it does own the
 * things all four need: a horizontal scroll container (these tables are wider than a
 * 900px embed and the page body must never scroll sideways), a sticky header so the
 * columns stay readable in the taller ones, and the fiscal-year / amount sort controls.
 *
 * **Sorting is not implemented here**, only rendered. Three of the four tables hold all
 * their rows and sort locally via `useTableSort`; contracts pages server-side, where a
 * local sort would reorder the 25 rows on screen rather than the ~2,400 in the dataset.
 * So the header emits `onSort(key)` and the caller decides what that means.
 *
 * **Every column declares a percentage width, and they sum to 100%.** This is what fixed
 * the uneven gaps QA flagged to the left of Amount. Two earlier attempts failed and are
 * worth not repeating: leaving the prose column unsized let auto layout hand it whatever
 * was left over (~115px, truncating every vendor name), and keeping pixel widths under
 * `table-layout: fixed` was worse, because a column with no width gets only the remainder
 * after the others are satisfied. Percentages summing to 100 under fixed layout are the
 * only arrangement where what you write is what renders — so if you add a column, take
 * the percentage out of a sibling.
 *
 * `box-sizing: border-box` on the cells is part of that guarantee. The embeds don't render
 * MUI's `CssBaseline`, so cells default to `content-box`, where a percentage is the
 * *content* width and the 24px of horizontal padding is added on top — every column comes
 * out 24px wider than declared and the boundaries drift (a 10/26/44/20 table measured
 * 11.2/25.9/42.4/20.4). Harmless on its own, but it means declared widths can't be relied
 * on, which the award drill-down in OtherInformation does when it lays itself out on this
 * same grid.
 */

export interface Column<Row> {
  key: string
  /** Node rather than string so a header can carry an info-icon tooltip. */
  label: React.ReactNode
  align?: 'left' | 'right'
  width?: string | number
  render: (row: Row) => React.ReactNode
  /** Optional full text shown on hover — for cells that get truncated. */
  title?: (row: Row) => string | undefined
  /** Set to make this header a sort control. The value is passed back to `onSort`. */
  sortKey?: string
  /**
   * Rendered beside the label but *outside* the sort control, so an info icon in a
   * sortable header doesn't trigger a sort when clicked.
   */
  headerAdornment?: React.ReactNode
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

interface Props<Row> {
  columns: Array<Column<Row>>
  rows: Row[]
  rowKey: (row: Row, i: number) => string
  headerColor?: string
  maxHeight?: number
  sort?: SortState
  onSort?: (key: string) => void
  /** Rendered under a row when expanded — used by the federal award drill-down. */
  renderDetail?: (row: Row) => React.ReactNode
  expandedKey?: string | null
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  headerColor = '#153750',
  maxHeight = 420,
  sort,
  onSort,
  renderDetail,
  expandedKey
}: Props<Row>) {
  return (
    <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight, background: 'white' }}>
      {/* `table-layout: fixed` because the widths below have to be authoritative. Under
          the default auto layout the browser treats them as hints and grows whichever
          column its content argues for, taking the space out of the one unsized column —
          which is how the recipient column ended up at ~115px, truncating every vendor
          name, while Term and Source sat 12px wider than asked. Fixed layout also means
          one pass instead of measuring content, so the long tables lay out faster. */}
      <Table size="small" stickyHeader sx={{ minWidth: 720, tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            {columns.map(c => {
              const sortable = c.sortKey && onSort
              const active = !!c.sortKey && sort?.key === c.sortKey
              return (
                <TableCell
                  key={c.key}
                  align={c.align ?? 'left'}
                  sortDirection={active ? sort!.dir : false}
                  sx={{
                    background: headerColor,
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    boxSizing: 'border-box',
                    // Deliberately NOT nowrap. These headers are the widest thing in
                    // several columns ("MEANS OF FINANCING" is ~190px on one line), and
                    // holding them to one line took the width out of the prose column —
                    // which is how "Encyclopaedia Britannica, Inc." ended up truncated to
                    // "Encyclopaedia…" in a 900px embed. Two-line headers cost one row of
                    // header height and give it back to the data.
                    px: 1.5,
                    width: c.width
                  }}
                >
                  <Stack
                    component="span"
                    direction="row"
                    alignItems="center"
                    justifyContent={c.align === 'right' ? 'flex-end' : 'flex-start'}
                    gap={0.5}
                    // No flexWrap: the row must stay one line so the info icon sits beside
                    // the label rather than dropping below it. The *label* wraps instead,
                    // via minWidth 0 on the sort control below.
                    sx={{ minWidth: 0 }}
                  >
                    {sortable ? (
                      <TableSortLabel
                        active={active}
                        direction={active ? sort!.dir : 'desc'}
                        onClick={() => onSort!(c.sortKey!)}
                        sx={{
                          // Lets the label text wrap to a second line inside the control
                          // instead of forcing the whole column wider.
                          minWidth: 0,
                          whiteSpace: 'normal',
                          textAlign: c.align === 'right' ? 'right' : 'left',
                          // The header sits on navy, so the default (dark, and hidden
                          // until hover) icon is invisible here. Shown at low opacity on
                          // every sortable column instead, so it reads as "you can sort
                          // this" without a hover.
                          color: 'inherit',
                          // TableSortLabel is a ButtonBase, which resets the cell's
                          // letter-spacing and text-transform — without these, sortable
                          // headers render title-case beside their UPPERCASE neighbours.
                          textTransform: 'inherit',
                          letterSpacing: 'inherit',
                          fontWeight: 'inherit',
                          '&:hover, &.Mui-active, &.Mui-focusVisible': { color: 'white' },
                          '& .MuiTableSortLabel-icon': {
                            color: 'rgba(255,255,255,0.55)',
                            opacity: 1,
                            // `flexShrink: 0` is load-bearing. MUI's arrow is a fixed-size
                            // SVG, so when the label above is squeezed narrower than its
                            // content the arrow can't shrink with it — it overflows the
                            // label's own box to the right and lands *on top of* the info
                            // icon beside it. Measured at -10px overlap on Fiscal Year and
                            // -8.4px on Amount before this. Holding the arrow's size and
                            // trimming its default 4px/4px margins makes the label's text
                            // wrap instead, which is the thing that should give way.
                            flexShrink: 0,
                            fontSize: 15,
                            marginLeft: '2px',
                            marginRight: 0
                          },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'white' }
                        }}
                      >
                        {c.label}
                      </TableSortLabel>
                    ) : (
                      c.label
                    )}
                    {c.headerAdornment}
                  </Stack>
                </TableCell>
              )
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => {
            const key = rowKey(row, i)
            const detail = renderDetail && expandedKey === key ? renderDetail(row) : null
            return (
              <Fragment key={key}>
                <TableRow hover>
                  {columns.map(c => {
                    const title = c.title?.(row)
                    const cell = (
                      <TableCell
                        key={c.key}
                        align={c.align ?? 'left'}
                        sx={{ fontSize: 13, verticalAlign: 'top', px: 1.5, width: c.width, boxSizing: 'border-box' }}
                      >
                        {c.render(row)}
                      </TableCell>
                    )
                    return title ? (
                      <Tooltip key={c.key} title={title} placement="top-start" enterDelay={400}>
                        {cell}
                      </Tooltip>
                    ) : (
                      cell
                    )
                  })}
                </TableRow>
                {detail && (
                  <TableRow>
                    <TableCell colSpan={columns.length} sx={{ p: 0, background: '#f7f9fa' }}>
                      {detail}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

/** Clamps long bill text to a couple of lines; the full string goes in the row tooltip. */
export function Clamp({ children, lines = 2 }: { children: React.ReactNode; lines?: number }) {
  return (
    <Box
      sx={{
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden'
      }}
    >
      {children}
    </Box>
  )
}

type SortValue = number | string | null | undefined

/**
 * Client-side sort for the tables that hold all their rows (grants, CIP, documents).
 *
 * Rows with no value sort **last in both directions**, matching what the contracts
 * endpoint does server-side: a missing fiscal year or a contract stating "VARIOUS"
 * instead of an amount isn't a small value, it's an absent one, so floating it to the top
 * of an ascending sort would bury the real smallest figures.
 */
export function useTableSort<Row>(
  rows: Row[],
  accessors: Record<string, (row: Row) => SortValue>,
  initial: SortState
) {
  const [sort, setSort] = useState<SortState>(initial)

  const sorted = useMemo(() => {
    const get = accessors[sort.key]
    if (!get) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      const ma = va == null || va === ''
      const mb = vb == null || vb === ''
      if (ma || mb) return ma && mb ? 0 : ma ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb)
      return dir * String(va).localeCompare(String(vb))
    })
    // `accessors` is rebuilt every render by callers, so it's deliberately not a dep —
    // the sort only needs to re-run when the rows or the sort state change.
  }, [rows, sort])

  function onSort(key: string) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  return { sorted, sort, onSort }
}
