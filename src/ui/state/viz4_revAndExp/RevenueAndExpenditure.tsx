import './RevenueAndExpenditure.scss'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Dialog, IconButton, Slider, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { Chart, PALETTE_8, CURRENT_YEAR } from '../../../constants'
import { formatCurrency, mergeSmallSlices, DonutData, DetailData, slug, wait } from '../../../util'
import { createOuterDonut, updateOuterDonutHover } from './createOuterDonut'
import { createInnerDonut, updateInnerDonutHover } from './createInnerDonut'
import { createDetailDonut } from './createDetailDonut'
import { OtherTooltip } from './OtherTooltip'
import { ViewByDropdown } from '../../Dropdown'
import { useUrlParam, useVizSize } from '../../../hooks'
import { useSetParam } from '../../../embed/ParamContext'
import { DownloadDataButton } from '../../DownloadDataButton'

interface OtherTooltipState {
  visible: boolean
  x: number
  y: number
  segments: { name: string; value: number }[]
  totalValue: number
}

let _unmounting = false

export function RevenueAndExpenditure() {
  const setParam = useSetParam()
  const initialRenderTimeRef = useRef(Date.now())
  const svgRef = useRef<SVGSVGElement>(null)
  const detailSvgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const theme = useTheme()
  const year = useUrlParam<number>('year', 'number', 2025)
  const _area = useUrlParam('area')
  const _dept = useUrlParam('dept')
  const viewBy = useUrlParam('view-by', 'string', 'department') as 'area' | 'department'
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const [, setOuterDonutData] = useState<DonutData[]>([])
  const [innerDonutData, setInnerDonutData] = useState<DonutData[]>([])
  const [detailDonutData, setDetailDonutData] = useState<DetailData[]>([])
  // prettier-ignore
  const [selectedOuterSegment, setSelectedOuterSegment] = useState<string | null>((viewBy === 'area' ? _area : _dept) as string | null)
  const selectedOuterSegmentRef = useRef<string | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  // prettier-ignore
  const [otherTooltip, setOtherTooltip] = useState<OtherTooltipState>({ visible: false, x: 0, y: 0, segments: [], totalValue: 0 })
  const renderCount = useRef(1)
  const transitionInProgressRef = useRef(false)

  selectedOuterSegmentRef.current = selectedOuterSegment

  // Get available years from data
  useEffect(() => {
    if (!window._data) return
    const years = Array.from(new Set(window._data.map(d => d.fiscal_year))).sort((a, b) => a - b)
    setAvailableYears(years)
  }, [])

  const thisYearsData = useMemo(() => {
    if (!window._data) return []
    const data = window._data.filter((d: any) => d.fiscal_year === year)
    return data
  }, [window._data, year])

  const totalBudget = useMemo(() => {
    return d3.sum(thisYearsData, d => d.budget)
  }, [thisYearsData])

  // Every year, not just the one on the slider: the slider is how you browse this donut,
  // not a statement about which data you want. Grouped by the dimension currently shown
  // (area or department) × funding source, which is what the two rings encode.
  const downloadRows = useMemo(() => {
    if (!window._data) return []
    const totals = new Map<string, { fiscal_year: number; group: string; funding_source: string; amount: number }>()
    for (const d of window._data as any[]) {
      const group = (viewBy === 'area' ? d.area : d.department) ?? 'Unknown'
      const key = `${d.fiscal_year}|${group}|${d.funding_source}`
      const entry = totals.get(key)
      if (entry) entry.amount += d.budget || 0
      else
        totals.set(key, {
          fiscal_year: d.fiscal_year,
          group,
          funding_source: d.funding_source,
          amount: d.budget || 0
        })
    }
    return Array.from(totals.values())
      .filter(r => r.amount !== 0)
      .sort((a, b) => a.fiscal_year - b.fiscal_year || a.group.localeCompare(b.group))
      .map(r => ({ fiscal_year: r.fiscal_year, [viewBy]: r.group, funding_source: r.funding_source, amount: r.amount }))
  }, [window._data, viewBy])

  const [allAreas, allDepartments, allFundingSources] = useMemo(() => {
    let areas = [...new Set(thisYearsData.map(d => d.area))].sort()
    let departments = [...new Set(thisYearsData.map(d => d.department))].sort()
    let fundingSources = [...new Set(thisYearsData.map(d => d.funding_source))].filter(f => f !== 'Other').sort()
    return [areas, departments, fundingSources]
  }, [thisYearsData])

  const outerSegments = viewBy === 'area' ? allAreas : allDepartments
  const innerSegments = allFundingSources
  const detailSegments = viewBy === 'area' ? allDepartments : allAreas

  const outerColors = useMemo(() => {
    const field = viewBy === 'area' ? 'area' : 'department'
    const segmentValues = d3.rollup(
      thisYearsData,
      v => d3.sum(v, d => d.budget),
      d => d[field]
    )
    const sortedSegments = [...outerSegments].sort((a, b) => {
      if (a === 'Other' && b !== 'Other') return 1
      if (b === 'Other' && a !== 'Other') return -1
      return (segmentValues.get(b) || 0) - (segmentValues.get(a) || 0)
    })
    return d3.scaleOrdinal<string, string>().domain(sortedSegments).range(PALETTE_8)
  }, [outerSegments, thisYearsData, viewBy])

  const innerColors = useMemo(() => {
    const innerColors3 = ['#153750', '#008f8c', '#0c5a9a']
    return d3.scaleOrdinal<string, string>().domain(innerSegments).range(innerColors3)
  }, [innerSegments])

  const detailColors = useMemo(() => {
    return d3.scaleOrdinal<string, string>().domain(detailSegments).range(PALETTE_8)
  }, [detailSegments])

  // Update url as needed
  useEffect(() => {
    if (_unmounting) {
      return
    }

    const oneSecondAgo = Date.now() - 1000
    const initialRender = initialRenderTimeRef.current > oneSecondAgo
    if (!initialRender) {
      if (viewBy === 'area') {
        console.log('[RevenueAndExpenditure] calling setParam with area=%s', selectedOuterSegment)
        setParam({ area: selectedOuterSegment, 'view-by': viewBy, dept: null }, null, { clear: true })
      } else {
        console.log('[RevenueAndExpenditure] calling setParam with dept=%s', selectedOuterSegment)
        setParam({ dept: selectedOuterSegment, 'view-by': viewBy, area: null }, null, { clear: true })
      }
    }

    if (!selectedOuterSegment) {
      return
    }

    const field = viewBy === 'area' ? 'area' : 'department'
    const otherField = viewBy === 'area' ? 'department' : 'area'

    const subset = thisYearsData.filter((d: any) => d[field] === selectedOuterSegment)

    // Calculate revenue source breakdown for this area
    const detailData = d3.rollup(
      subset,
      v => d3.sum(v, d => d.budget),
      d => d[otherField]
    )

    const rawDetailData: DetailData[] = Array.from(detailData, ([name, value]) => ({
      name: name as string,
      value: value as number,
      color: detailColors(name as string) as string
    }))

    setDetailDonutData(mergeSmallSlices(rawDetailData, 5, '#c4c4c4'))
  }, [selectedOuterSegment, viewBy, year, thisYearsData, detailColors])

  // Click handler for outer donut to show details
  const handleOuterClick = (segmentName: string) => {
    if (transitionInProgressRef.current) {
      return
    }

    transitionInProgressRef.current = true
    setTimeout(() => {
      transitionInProgressRef.current = false
    }, 1000)

    // Toggle selection if clicking the same segment
    if (selectedOuterSegmentRef.current === segmentName) {
      setSelectedOuterSegment(null)
      setDetailDonutData([])
      return
    }

    setSelectedOuterSegment(segmentName)
  }

  const handleDetailClick = (segmentName: string) => {
    const params: any = { viz: Chart.FUNDING_BY_PROGRAM }
    if (viewBy === 'area') {
      params.area = selectedOuterSegment
      params.dept = segmentName
    } else {
      params.area = segmentName
      params.dept = selectedOuterSegment
    }
    setParam(params)
  }

  // Main chart effect
  useEffect(() => {
    if (!svgRef.current || !window._data) return

    // Calculate outer donut data - always maintain original segment structure
    const outerData = d3.rollup(
      thisYearsData,
      v => d3.sum(v, d => d.budget),
      d => (viewBy === 'area' ? d.area : d.department)
    )

    const rawOuterDonutData: DonutData[] = Array.from(outerData, ([name, value]) => ({
      name: name as string,
      value: value as number
    })).filter(d => d.name && d.name.trim() !== '') // Filter out blank/empty area names

    const outerDonutData = mergeSmallSlices(rawOuterDonutData, 5, '#ddd')
    setOuterDonutData(outerDonutData)

    // Clear selection if the segment no longer exists in the new data
    if (selectedOuterSegment && !outerDonutData.some(d => d.name === selectedOuterSegment)) {
      setSelectedOuterSegment(null)
      setDetailDonutData([])
    }

    // Calculate inner donut data - always maintain original segment structure
    const innerData = d3.rollup(
      thisYearsData,
      v => d3.sum(v, d => d.budget),
      d => d.funding_source
    )

    const innerDonutData: DonutData[] = Array.from(innerData, ([name, value]) => ({
      name: name as string,
      value: value as number
    })).filter(d => d.name !== 'Other')

    setInnerDonutData(innerDonutData)

    // Calculate split data for inner donut if outer segment is selected
    let innerSplitData: { [fundingSourceName: string]: { related: number; total: number } } | undefined
    if (selectedOuterSegment) {
      const field = viewBy === 'area' ? 'area' : 'department'
      innerSplitData = {}

      for (const fundingSourceData of innerDonutData) {
        const relatedValue = d3.sum(
          thisYearsData.filter(d => d.funding_source === fundingSourceData.name && d[field] === selectedOuterSegment),
          d => d.budget
        )
        innerSplitData[fundingSourceData.name] = {
          related: relatedValue,
          total: fundingSourceData.value
        }
      }
    }

    const initalRender = renderCount.current === 1
    renderCount.current++

    // Create charts with responsive sizing
    const numCols = desktop ? 2 : 1
    const maxWidth = desktop ? 950 : 450
    const chartWidth = Math.min(vizSize.width, maxWidth) / numCols - 30
    const chartHeight = chartWidth
    const radius = chartWidth / 2 - 50

    createOuterDonut(
      svgRef.current,
      outerDonutData,
      handleOuterClick,
      outerColors,
      chartWidth,
      chartHeight,
      radius,
      selectedOuterSegment,
      initalRender,
      (name, event) => {
        if (transitionInProgressRef.current) {
          return
        }

        updateOuterDonutHover(svgRef.current, name, selectedOuterSegment)

        // Show tooltip for "Other" slices
        if (name === 'Other' && event) {
          const otherData = outerDonutData.find(d => d.name === 'Other')
          if (otherData?.mergedSegments) {
            setOtherTooltip({
              visible: true,
              x: event.clientX,
              y: event.clientY,
              segments: otherData.mergedSegments,
              totalValue: otherData.value
            })
          }
        } else {
          setOtherTooltip(prev => ({ ...prev, visible: false }))
        }
      }
    )

    // Calculate rotation offset for inner donut alignment
    const rotationOffset = selectedOuterSegment ? getOuterSegmentStartAngle(selectedOuterSegment, outerDonutData) : 0

    createInnerDonut(
      svgRef.current,
      innerDonutData,
      () => {},
      innerColors,
      radius,
      selectedOuterSegment,
      innerSplitData,
      initalRender,
      name => {
        if (transitionInProgressRef.current) {
          return
        }

        updateInnerDonutHover(svgRef.current, name)
      },
      rotationOffset
    )
  }, [year, viewBy, outerColors, innerColors, selectedOuterSegment, vizSize, desktop])

  // Detail chart effect
  useEffect(() => {
    if (!selectedOuterSegment || detailDonutData.length === 0) {
      if (detailSvgRef.current) {
        d3.select(detailSvgRef.current).selectAll('*').remove()
      }
      return
    }

    if (detailSvgRef.current) {
      createDetailDonut(detailSvgRef.current, detailDonutData, undefined, undefined, undefined, handleDetailClick)
    } else {
      wait(100).then(() => {
        createDetailDonut(detailSvgRef.current, detailDonutData, undefined, undefined, undefined, handleDetailClick)
      })
    }
  }, [selectedOuterSegment, detailDonutData])

  const onBodyClick = () => {
    if (selectedOuterSegment) {
      setSelectedOuterSegment(null)
    }
    if (detailDonutData) {
      setDetailDonutData([])
    }
  }

  // Function to calculate the start angle of a segment in the outer donut
  const getOuterSegmentStartAngle = (segmentName: string, data: DonutData[]): number => {
    if (!segmentName || !data.length) return 0

    // Create a temporary pie generator to calculate angles
    const pie = d3
      .pie<DonutData>()
      .value(d => d.value)
      .sort((a, b) => {
        if (a.name === 'Other' && b.name !== 'Other') return 1
        if (b.name === 'Other' && a.name !== 'Other') return -1
        return b.value - a.value
      })

    const pieData = pie(data)
    const segment = pieData.find(d => d.data.name === segmentName)
    return segment ? segment.startAngle : 0
  }

  const onDrillDownClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const div = document.querySelector('.RevenueAndExpenditure') as HTMLElement
    if (!div) {
      return
    }
    div.classList.add('fade-out')
    const params = { viz: Chart.FUNDING_BY_DEPT, area: selectedOuterSegment }
    setTimeout(() => {
      _unmounting = true
      setParam(params)
      setTimeout(() => {
        _unmounting = false
      }, 100)
    }, 300)
  }

  return (
    <Box
      className="RevenueAndExpenditure fade-in"
      px={4}
      py={2}
      sx={{
        '@keyframes bounce': {
          '0%, 20%, 50%, 80%, 100%': {
            transform: 'translate(-50%, -50%) translateY(0)'
          },
          '40%': {
            transform: 'translate(-50%, -50%) translateY(-10px)'
          },
          '60%': {
            transform: 'translate(-50%, -50%) translateY(-5px)'
          }
        }
      }}
      onClick={onBodyClick}
      onMouseLeave={() => setOtherTooltip(prev => ({ ...prev, visible: false }))}
    >
      <Box
        className="charts"
        sx={{
          display: { xs: 'block', md: 'grid' },
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: { xs: '40px', md: '20px' },
          alignItems: 'start',
          justifyItems: 'center'
        }}
      >
        <Box
          className="viz-primary"
          minWidth="300px"
          sx={{
            transition: 'transform 0.4s ease',
            transform: {
              xs: 'none',
              md: selectedOuterSegment && detailDonutData.length > 0 ? 'translateX(0)' : 'translateX(50%)'
            }
          }}
        >
          {/* Controls + Budget total */}

          <Box display="flex" flexDirection="column" alignItems="center" mb={-3}>
            <Box
              display="flex"
              flexWrap="wrap"
              alignItems="center"
              justifyContent="center"
              mb={1}
              columnGap="40px"
              rowGap="20px"
            >
              <ViewByDropdown
                value={viewBy}
                onChange={e => {
                  setParam('view-by', e.target.value)
                  setSelectedOuterSegment(null)
                  setDetailDonutData([])
                }}
              />

              {availableYears.length > 0 && (
                <Box
                  sx={{ width: '180px', maxWidth: 400, transform: 'translateY(-5px)', overflow: 'visible' }}
                  onClick={e => e.stopPropagation()}
                >
                  <Box sx={{ position: 'relative', transform: 'translateY(5px)', overflow: 'visible' }}>
                    <Typography
                      id="year-slider"
                      variant="body2"
                      sx={{ textAlign: 'center', fontSize: 'calc(var(--font-size-sm) + 2px)', whiteSpace: 'nowrap' }}
                    >
                      Fiscal Year: {year}
                    </Typography>
                    {year > CURRENT_YEAR && (
                      <Box
                        component="span"
                        sx={{
                          position: 'absolute',
                          right: '-60px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '10px',
                          fontWeight: 600,
                          backgroundColor: '#f0f0f0',
                          color: '#697d8e',
                          px: '6px',
                          py: '2px',
                          borderRadius: '4px',
                          lineHeight: 1,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Current FY
                      </Box>
                    )}
                  </Box>
                  <Slider
                    value={year}
                    onChange={(_event, newValue) => {
                      if (availableYears.includes(newValue as number)) {
                        setParam('year', newValue)
                      }
                    }}
                    min={Math.min(...availableYears)}
                    max={Math.max(...availableYears)}
                    step={1}
                    marks={availableYears.filter(y => y > CURRENT_YEAR).map(y => ({ value: y }))}
                    valueLabelDisplay="off"
                    aria-labelledby="year-slider"
                  />
                </Box>
              )}

              <DownloadDataButton
                filename={`state-budget-composition-by-${viewBy}`}
                scope="all fiscal years"
                rows={downloadRows}
              />
            </Box>

            <Typography variant="body1" color="#555" fontSize="var(--font-size-lg)" fontWeight="bold">
              Budget total: {formatCurrency(totalBudget)}
            </Typography>
          </Box>
          {/* Outer Donut */}

          <svg ref={svgRef}>
            <g>
              <g className="outer-donut"></g>
              <g className="inner-donut"></g>
            </g>
          </svg>

          {/* Funding Source Legend */}

          <Box sx={{ pl: '2rem' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Inner ring - Funding Source</h3>
            <Box display="flex" flexWrap="wrap" gap="16px">
              {innerDonutData &&
                innerDonutData
                  .sort((a, b) => b.value - a.value)
                  .map((d, i) => (
                    <Box key={i} display="flex" alignItems="center" gap="6px">
                      <Box
                        width="12px"
                        height="12px"
                        sx={{ backgroundColor: innerColors(d.name) as string, borderRadius: '2px' }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>{d.name}</span>
                    </Box>
                  ))}
            </Box>
          </Box>

          {/* Interaction cue */}

          {!selectedOuterSegment && (
            <Typography variant="body2" color="text.secondary" mt={2} textAlign="center" fontStyle="italic">
              Click any slice to see more details
            </Typography>
          )}
        </Box>

        {/* Detail Donut */}

        {selectedOuterSegment && detailDonutData.length > 0 && (
          <DetailDonut
            selectedOuterSegment={selectedOuterSegment}
            setSelectedOuterSegment={setSelectedOuterSegment}
            detailDonutData={detailDonutData}
            setDetailDonutData={setDetailDonutData}
            detailSvgRef={detailSvgRef}
            viewBy={viewBy}
            handleDetailClick={handleDetailClick}
            onDrillDownClick={onDrillDownClick}
            desktop={desktop}
          />
        )}
      </Box>

      <OtherTooltip
        visible={otherTooltip.visible}
        x={otherTooltip.x}
        y={otherTooltip.y}
        segments={otherTooltip.segments}
        totalValue={otherTooltip.totalValue}
      />
    </Box>
  )
}

interface DetailDonutProps {
  selectedOuterSegment: string | null
  setSelectedOuterSegment: (segment: string | null) => void
  detailDonutData: DetailData[]
  setDetailDonutData: (data: DetailData[]) => void
  detailSvgRef: React.RefObject<SVGSVGElement>
  viewBy: 'area' | 'department'
  handleDetailClick: (segment: string) => void
  onDrillDownClick: (e: React.MouseEvent) => void
  desktop: boolean
}

function DetailDonut(props: DetailDonutProps) {
  const {
    selectedOuterSegment,
    setSelectedOuterSegment,
    detailDonutData,
    setDetailDonutData,
    detailSvgRef,
    viewBy,
    handleDetailClick,
    desktop
  } = props

  const ui = (
    <Box
      className="viz-secondary"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      sx={{
        mt: { md: '100px' }
      }}
    >
      <Box
        width="100%"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        px={3}
        py={2}
        borderRadius={2}
        sx={{
          backgroundColor: desktop ? '#f9f9fe' : undefined
        }}
        onClick={e => e.stopPropagation()}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" gap="10px" width="100%">
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
            {selectedOuterSegment} Breakdown{' '}
          </h3>
          <IconButton
            sx={{ transform: 'translate(5px, -4px)' }}
            onClick={() => {
              setSelectedOuterSegment(null)
              setDetailDonutData([])
            }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <p style={{ margin: '0', fontSize: '14px', fontWeight: 500, color: '#666' }}>
          Total: {formatCurrency(d3.sum(detailDonutData, d => d.value))}
        </p>
        <svg ref={detailSvgRef}></svg>

        <Box mb={3} className="detail-donut">
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>
            {viewBy === 'area' ? 'Departments' : 'Areas'}
          </h3>
          {detailDonutData
            .sort((a, b) => b.value - a.value)
            .map((d, i) => {
              const row = (
                <Box
                  key={i}
                  display="flex"
                  alignItems="center"
                  py="2px"
                  className={`slice slice-${slug(d.name)}`}
                  style={{ cursor: d.name === 'Other' ? 'default' : 'pointer' }}
                  onMouseEnter={() => {
                    if (d.name === 'Other') return
                    d3.selectAll('.detail-donut .slice').style('opacity', 0.5)
                    d3.selectAll(`.detail-donut .slice.slice-${slug(d.name)}`).style('opacity', 1)
                  }}
                  onMouseLeave={() => {
                    d3.selectAll('.detail-donut .slice').style('opacity', 1)
                  }}
                  onClick={() => d.name !== 'Other' && handleDetailClick(d.name)}
                >
                  <Box width="15px" height="15px" mr="10px" sx={{ backgroundColor: d.color }}></Box>
                  {d.name === 'Other' && (d as any).mergedSegments ? (
                    <Tooltip
                      arrow
                      placement="top-start"
                      slotProps={{
                        tooltip: {
                          sx: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            padding: '12px 10px',
                            maxWidth: 300,
                            '& .labelvalue2': { lineHeight: 1.3 }
                          }
                        },
                        arrow: { sx: { color: 'rgba(0,0,0,0.8)' } },
                        popper: { modifiers: [{ name: 'offset', options: { offset: [0, -2] } }] }
                      }}
                      title={
                        <Box sx={{ lineHeight: 1.4 }}>
                          {((d as any).mergedSegments as { name: string; value: number }[])
                            .sort((a, b) => b.value - a.value)
                            .map((s, j) => (
                              <div key={j} className="labelvalue2">
                                <span>{s.name}</span>
                                <span>{formatCurrency(s.value)}</span>
                              </div>
                            ))}
                        </Box>
                      }
                    >
                      <span>{d.name}</span>
                    </Tooltip>
                  ) : (
                    <span>{d.name}</span>
                  )}
                </Box>
              )

              return row
            })}
        </Box>

        {/* <Box width="100%">
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={onDrillDownClick}
            startIcon={<ArrowCircleRightOutlinedIcon />}
          >
            View Details
          </Button>
        </Box> */}
      </Box>
    </Box>
  )

  if (desktop) {
    return ui
  }

  return <SimpleDialog onClose={() => setSelectedOuterSegment(null)}>{ui}</SimpleDialog>
}

function SimpleDialog({ children, onClose }) {
  return (
    <Dialog open onClose={onClose} transitionDuration={100}>
      <Box p={2} pt={1}>
        {children}
      </Box>
    </Dialog>
  )
}
