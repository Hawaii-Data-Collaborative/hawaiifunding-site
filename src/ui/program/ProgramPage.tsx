import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material'
import { useUrlParam } from '../../hooks'
import { useSetParam } from '../../embed/ParamContext'
import {
  loadProgramDetail,
  loadProgramList,
  type ProgramDetail,
  type ProgramSummary
} from '../../loadProgramData'
import { track } from '../../analytics'
import { SectionBand } from './chrome'
import { ProgramSearch } from './ProgramSearch'
import { ProgramHeader } from './ProgramHeader'
import { BudgetOverTime } from './BudgetOverTime'
import { BudgetByStage } from './BudgetByStage'
import { GrantsInAid } from './GrantsInAid'
import { CapitalProjects } from './CapitalProjects'
import { ProgramContracts } from './ProgramContracts'
import { OtherInformation } from './OtherInformation'

/**
 * Program ID — the whole feature, from search to sections.
 *
 * Both mockup screens live here: with no program chosen it's the landing search, and
 * choosing one swaps in the header + sections while keeping the search available up top.
 * That's one embed div on the host page instead of two, and it means the back/forward
 * buttons work through `?program=AGR151`.
 *
 * The selection is local state seeded from the URL (or the embed's ParamStore) rather
 * than read from it every render, because the search box has to stay responsive while
 * the detail request is in flight.
 */
export function ProgramPage() {
  const paramProgram = useUrlParam<string>('program', 'string', '')
  const setParam = useSetParam()

  const [programs, setPrograms] = useState<ProgramSummary[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>((paramProgram ?? '').toUpperCase())
  const [detail, setDetail] = useState<ProgramDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // How the reader arrived at the current program. Starts as 'deeplink' because the only
  // way a program is selected before any interaction is `?program=` (or the embed's
  // initialParams); `select` flips it once someone uses the search box. Worth separating:
  // a program that only ever arrives by deep link is one someone else is linking to,
  // which is different from one people find on their own.
  const entryMode = useRef<'deeplink' | 'search'>('deeplink')

  useEffect(() => {
    loadProgramList()
      .then(setPrograms)
      .catch(err => {
        const msg = err.message ?? String(err)
        setListError(msg)
        track('error', { chart: 'program-list', detail: msg })
      })
  }, [])

  // Follow the URL / ParamStore when it changes underneath us (back button, or a host
  // page driving the embed's params).
  useEffect(() => {
    const fromParam = (paramProgram ?? '').toUpperCase()
    if (fromParam && fromParam !== selectedId) setSelectedId(fromParam)
  }, [paramProgram])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setDetailError(null)
    loadProgramDetail(selectedId)
      .then(d => {
        if (cancelled) return
        setDetail(d)
        // Reported on successful load rather than on selection, so a bad ?program= or a
        // failed request doesn't register as somebody having viewed the program.
        track('program_view', { detail: selectedId, value: entryMode.current })
      })
      .catch(err => {
        if (!cancelled) {
          setDetail(null)
          const msg = err.message ?? String(err)
          setDetailError(msg)
          track('error', { chart: 'program-detail', detail: `${selectedId}: ${msg}` })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  function select(p: ProgramSummary | null) {
    const id = p?.program_id ?? ''
    entryMode.current = 'search'
    setSelectedId(id)
    // Standalone: writes ?program= so the page is shareable and the back button works.
    // Embed: writes the instance's ParamStore instead of touching the host page's URL.
    setParam('program', id || null, { clear: true })
  }

  const selected = useMemo(
    () => programs.find(p => p.program_id === selectedId) ?? null,
    [programs, selectedId]
  )

  if (listError) {
    return (
      <Alert severity="error" sx={{ m: 2, fontSize: 13 }}>
        Couldn&rsquo;t load the program list: {listError}
      </Alert>
    )
  }

  // Landing screen — the mockup's Screen 1, minus the struck-out login panel, styled like
  // the live pages' centered "Ready to explore the data?" prompt rather than the deck's
  // navy bar over a grey box.
  if (!selectedId) {
    return (
      <Box className="ProgramPage fade-in" px={2} py={5}>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.7rem', sm: '2rem' },
            fontWeight: 600,
            color: '#153750',
            textAlign: 'center',
            textWrap: 'balance',
            mb: 1
          }}
        >
          Find a Program
        </Typography>
        <Typography
          sx={{ fontSize: 15, color: '#153750', textAlign: 'center', maxWidth: 640, mx: 'auto', mb: 3 }}
        >
          Search by program ID or keyword to see what a program was appropriated, how that figure moved through the
          legislature, and the grants, contracts, and capital funding attached to it.
        </Typography>
        <Box sx={{ maxWidth: 560, mx: 'auto' }}>
          <ProgramSearch
            programs={programs}
            value={null}
            onChange={select}
            variant="landing"
            disabled={!programs.length}
          />
          <Typography sx={{ fontSize: 13, color: '#697d8e', mt: 1.5, textAlign: 'center' }}>
            {programs.length
              ? `${programs.length} programs, FY 2016–2027. Try an ID like AGR151, a program name, or a department.`
              : 'Loading programs…'}
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box className="ProgramPage fade-in" p={2}>
      {detailError && (
        <Alert severity="error" sx={{ mb: 2, fontSize: 13 }}>
          Couldn&rsquo;t load {selectedId}: {detailError}
        </Alert>
      )}

      {loading && !detail && (
        <Stack direction="row" justifyContent="center" alignItems="center" gap={1.5} py={6}>
          <CircularProgress size={22} />
          <Typography sx={{ fontSize: 13, color: '#697d8e' }}>Loading {selectedId}…</Typography>
        </Stack>
      )}

      {detail && (
        <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <ProgramHeader detail={detail} programs={programs} onSelect={select} />

          {/* Two bands mirroring the live pages' rhythm: the longitudinal charts sit in a
              grey band (as "10 Year Budget Trends" does), the record-level detail follows
              on the page ground (as "Fiscal Year Breakdown" does). */}
          <SectionBand
            title="Appropriations Over Time"
            subtitle="How much this program was appropriated each fiscal year, and how each year's figure moved through the legislature."
            banded
          >
            <BudgetOverTime rows={detail.overTime} mofByYear={detail.mofByYear} />
            {/* The bill-detail drill-down hangs off Budget By Stage, per QA — that's the
                chart whose bars the per-version figures actually belong to. */}
            <BudgetByStage
              rows={detail.byStage}
              overTime={detail.overTime}
              billDetail={detail.billDetail}
            />
          </SectionBand>

          <SectionBand
            title="Associated Funding &amp; Records"
            subtitle="Grants-in-aid, capital improvement projects, contracts, and other records attached to this program with the source documents behind them."
          >
            <GrantsInAid grants={detail.grants} sessions={detail.coverage.grantSessions} />
            <CapitalProjects cip={detail.cip} sessions={detail.coverage.cipSessions} />
            <ProgramContracts programId={detail.program.program_id} />
            <OtherInformation documents={detail.documents} />
          </SectionBand>
        </Box>
      )}

      {/* The search stays reachable when a lookup fails, so a bad ?program= isn't a dead end. */}
      {!detail && !loading && detailError && (
        <ProgramSearch programs={programs} value={selected} onChange={select} variant="landing" />
      )}
    </Box>
  )
}
