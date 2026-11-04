import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { track, trackChartViewOnce, trackInteract, trackNow } from '../analytics'

/**
 * Analytics wrapper for an embed's root element.
 *
 * Replaces the plain `<div className="hfp-embed">` in each entry point rather than adding a
 * node, so it changes no layout. It does three things the charts themselves shouldn't have
 * to know about:
 *
 *  1. Fires `chart_view` when the root first scrolls into the viewport — not on render.
 *     Several charts sit well below the fold on the host pages, and "rendered" would
 *     count views nobody had.
 *  2. Publishes the chart's registry name on a context, so any control inside can report
 *     an interaction without every chart having to thread a name down through props.
 *     This is what lets one edit to `YearSlider` cover all five charts that use it.
 *  3. Catches outbound clicks by delegation. The Program ID sections link out to bill
 *     text, worksheets, contract PDFs and GIA records from five different files; a
 *     capture-phase listener on the root sees all of them, including any added later.
 */

const ChartNameContext = createContext<string | null>(null)

export function useChartName(): string | null {
  return useContext(ChartNameContext)
}

/**
 * Returns a debounced interaction reporter bound to the enclosing chart.
 * Call as `report('year', 2024)` — the control name and its new value.
 */
export function useTrackInteract() {
  const chart = useChartName()
  return useCallback(
    (control: string, value?: string | number) => {
      trackInteract(chart ?? 'unknown', control, value)
    },
    [chart]
  )
}

interface Props {
  /** Registry name, e.g. `federal-yoy`. Omit for the Program ID page, which reports its
   *  own `program_view` events and has no single chart identity. */
  chart?: string
  className: string
  /** Delegate outbound-link clicks (Program ID). */
  trackOutbound?: boolean
  children: React.ReactNode
}

export function TrackedEmbed({ chart, className, trackOutbound, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !chart) return

    // No IntersectionObserver (very old browser): count it as seen rather than lose it.
    if (typeof IntersectionObserver === 'undefined') {
      trackChartViewOnce(chart)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            trackChartViewOnce(chart)
            observer.disconnect()
          }
        }
      },
      // A quarter visible is a real sighting; requiring more misses tall charts on
      // short viewports, which never reach a high threshold at all.
      { threshold: 0.25 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [chart])

  useEffect(() => {
    const el = ref.current
    if (!el || !trackOutbound) return

    function onClick(e: MouseEvent) {
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link) return
      const href = link.getAttribute('href') ?? ''
      if (!/^https?:/i.test(href)) return

      // `trackNow` rather than `track`: the queue dies with the page on navigation.
      trackNow('outbound', {
        chart: link.dataset.hfpKind || 'link',
        detail: href
      })
    }

    // Capture phase so a handler that calls stopPropagation can't hide the click.
    el.addEventListener('click', onClick, true)
    return () => el.removeEventListener('click', onClick, true)
  }, [trackOutbound])

  return (
    <ChartNameContext.Provider value={chart ?? null}>
      <div className={className} ref={ref}>
        {children}
      </div>
    </ChartNameContext.Provider>
  )
}

/** Report a client-side failure. Chart name comes from context where there is one. */
export function useTrackError() {
  const chart = useChartName()
  return useCallback(
    (stage: string, message: string) => {
      track('error', { chart: chart ?? stage, detail: message.slice(0, 200) })
    },
    [chart]
  )
}
