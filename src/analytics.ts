/**
 * First-party usage analytics for the three embed bundles.
 *
 * Posts small batches to `POST /api/e` on the same origin as the host page. (The path is
 * deliberately short and meaningless — see "Why the endpoint is called /api/e" in
 * docs/deploy.md.) That
 * works because `hawaiifunding.org/api/*` is routed past Squarespace to our Bun server by
 * Cloudflare — the same reason `loadProgramData.ts` and `loadFederalData.ts` can fetch
 * `/api/...` with a relative path. Consequences worth knowing:
 *
 *   - No third-party script, so nothing for an ad blocker to block and no consent banner
 *     entanglement with Squarespace's own cookie notice.
 *   - No CORS, no absolute URL, no measurement ID to configure.
 *   - It only reports where the API is reachable. On the `embed-test*.html` dev pages
 *     without the server running, posts fail and are dropped silently — which is what you
 *     want, so local fiddling doesn't land in the numbers.
 *
 * Identity: a persistent `localStorage` visitor id (so the same people returning weeks
 * apart count once) plus a per-tab `sessionStorage` session id. No PII is collected here;
 * the server records IP and Cloudflare's country header alongside these.
 */

export type Bundle = 'state' | 'federal' | 'program'

/** Closed set, mirrored by EVENT_NAMES in server/src/events.ts. Adding one means adding
 *  it in both places — the server drops names it doesn't recognise. */
export type EventName =
  | 'chart_view'
  | 'chart_interact'
  | 'download'
  | 'program_view'
  | 'program_search'
  | 'outbound'
  | 'error'

export interface TrackParams {
  /** Chart/registry name, or the outbound-link kind. */
  chart?: string
  /** The specific thing: control name, program id, search text, URL. */
  detail?: string
  /** Small qualifier: a control's new value, a result count, an entry mode. */
  value?: string | number
}

interface QueuedEvent extends TrackParams {
  event: EventName
  bundle: Bundle | 'unknown'
  path?: string
  referrer?: string
  t: number
}

/**
 * The endpoint name and the transport below are both load-bearing, for one reason:
 * EasyPrivacy ships a generic, first-party rule
 *
 *     /api/events|$ping,~third-party
 *
 * which blocks exactly a `sendBeacon` (request type `ping`) to a URL ending in
 * `/api/events` — written to catch self-hosted analytics, and we had walked straight into
 * it. Being first-party avoids the host-based blocking that stops GA, but not path rules
 * like this one. Verified against the published lists: this path is unmatched under both
 * the `ping` and `xhr` request types.
 */
const ENDPOINT = '/api/e'
const FLUSH_INTERVAL_MS = 15_000
/** Matches MAX_BATCH on the server; a larger batch would be truncated there. */
const MAX_BATCH = 50

/**
 * Opt-in console tracing. Everything here is deliberately silent — analytics must never
 * break a chart, so failures are swallowed — which makes it invisible when you're trying
 * to confirm it works. Run `localStorage.hfp_debug = '1'` in the page console and reload,
 * and every queued and flushed event is logged. Read once at load, so normal operation
 * pays nothing per event.
 */
let tracing = false
try {
  tracing = window.localStorage.getItem('hfp_debug') === '1'
} catch {
  // storage unavailable — stay quiet
}

let bundle: Bundle | 'unknown' = 'unknown'
let queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

/* --------------------------------------------------------------------- identity */

const VISITOR_KEY = 'hfp_vid'
const SESSION_KEY = 'hfp_sid'

function randomId(): string {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Read-or-create an id in the given storage.
 *
 * Every access is wrapped: Safari's private mode, "block all cookies", and embedded
 * third-party contexts can all make `localStorage` *throw* on access rather than return
 * null. When that happens we fall back to a per-page-load id, so a locked-down browser
 * still reports usage — it just counts as a new visitor each time.
 */
function persistentId(store: 'localStorage' | 'sessionStorage', key: string): string {
  try {
    const s = window[store]
    const existing = s.getItem(key)
    if (existing) return existing
    const fresh = randomId()
    s.setItem(key, fresh)
    return fresh
  } catch {
    return randomId()
  }
}

let visitorId: string | null = null
let sessionId: string | null = null

function ids() {
  if (!visitorId) visitorId = persistentId('localStorage', VISITOR_KEY)
  if (!sessionId) sessionId = persistentId('sessionStorage', SESSION_KEY)
  return { visitor: visitorId, session: sessionId }
}

/* ---------------------------------------------------------------------- sending */

// Off: the static site has no server to collect events (hfp's /api/e). Returning here, before
// ids(), also means no visitor or session IDs are written to the browser's storage.
const ENABLED = false

function send(batch: QueuedEvent[]) {
  if (!ENABLED || !batch.length) return
  const { visitor, session } = ids()
  const body = JSON.stringify({ visitor, session, events: batch })

  if (tracing) console.log(`[hfp] flushing ${batch.length} event(s)`, { visitor, session })

  try {
    // `keepalive` is what makes this survive the page unload that would otherwise kill an
    // in-flight request — the case that matters for an outbound-link click. It is the
    // modern replacement for `sendBeacon` and does the same job here.
    //
    // Deliberately NOT sendBeacon: it issues a `ping`-type request, which is the type the
    // EasyPrivacy rule above singles out. A blocked beacon fails silently and takes the
    // whole batch with it.
    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true
    }).catch(() => {})
  } catch {
    // Analytics must never break a chart. Drop and move on.
  }
}

export function flush() {
  if (!queue.length) return
  const batch = queue
  queue = []
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  send(batch)
}

function attachListeners() {
  if (listenersAttached) return
  listenersAttached = true
  // `visibilitychange`→hidden is the reliable one; `pagehide` covers Safari's back/forward
  // cache. `beforeunload` is deliberately not used — it suppresses the bfcache.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}

/* --------------------------------------------------------------------- tracking */

/** Called once per bundle from its embed entry point. */
export function initAnalytics(b: Bundle) {
  bundle = b
  attachListeners()
  if (tracing) console.log(`[hfp] analytics ready — bundle=${b}, posting to ${ENDPOINT}`)
}

export function track(event: EventName, params: TrackParams = {}) {
  try {
    queue.push({
      event,
      bundle,
      chart: params.chart,
      detail: params.detail,
      value: params.value === undefined ? undefined : String(params.value),
      path: location.pathname + location.search,
      referrer: document.referrer || undefined,
      t: Date.now()
    })

    if (tracing) console.log('[hfp] queued', queue[queue.length - 1])

    if (queue.length >= MAX_BATCH) {
      flush()
      return
    }
    if (!timer) timer = setTimeout(flush, FLUSH_INTERVAL_MS)
  } catch {
    // never throw from instrumentation
  }
}

/**
 * Send immediately rather than on the next flush. For clicks that navigate away — the
 * queue would be discarded with the page otherwise.
 */
export function trackNow(event: EventName, params: TrackParams = {}) {
  track(event, params)
  flush()
}

const viewed = new Set<string>()

/**
 * Fire `chart_view` at most once per chart per page load.
 *
 * A React re-render must not count as a new view, and neither should scrolling a chart
 * out of and back into the viewport — the question this answers is "was this chart ever
 * actually seen", so the first sighting is the only one that carries information.
 */
export function trackChartViewOnce(chart: string) {
  if (viewed.has(chart)) return
  viewed.add(chart)
  track('chart_view', { chart })
}

/** Debounced interaction tracking, keyed by chart+control.
 *
 * The year sliders emit a change per drag step; unthrottled, one drag would spend a
 * quarter of the batch limit on a single gesture and drown every other signal. The
 * trailing edge is the right one to keep: it's where the user stopped. */
const pending = new Map<string, ReturnType<typeof setTimeout>>()

export function trackInteract(chart: string, control: string, value?: string | number, wait = 600) {
  trackDebounced(`${chart}::${control}`, 'chart_interact', { chart, detail: control, value }, wait)
}

/**
 * Trailing-edge debounce on an arbitrary event, keyed so unrelated controls don't cancel
 * each other. Used for search-as-you-type, where every keystroke would otherwise be an
 * event and "kalo" would arrive as k, ka, kal, kalo.
 */
export function trackDebounced(
  key: string,
  event: EventName,
  params: TrackParams,
  wait = 600
) {
  const existing = pending.get(key)
  if (existing) clearTimeout(existing)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      track(event, params)
    }, wait)
  )
}
