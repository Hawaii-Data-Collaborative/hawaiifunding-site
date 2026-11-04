import * as d3 from 'd3'

export function getVizSize() {
  const root = document.getElementById('root')
  const mainDiv = root?.children[0]?.children[1]
  if (!mainDiv) {
    return {
      width: Math.max(Math.min(window.innerWidth - 40, 1000), 500),
      height: Math.min(Math.max(window.innerHeight * 0.8, 400), 700)
    }
  }
  const rect = mainDiv.getBoundingClientRect()
  const width0 = Math.round(rect.width)
  const width1 = Math.min(width0, window.innerWidth - 200)
  const width = Math.max(width1, 500)
  const height0 = Math.round(window.innerHeight * 0.8)
  const height1 = Math.min(width * 0.8, height0)
  const height = Math.min(Math.max(height1, 400), 700)
  console.log('[getVizSize] width=%s height=%s', width, height)
  return { width, height }
}

export function getUrlParam(key: string, defaultValue?: any) {
  const params = new URLSearchParams(window.location.search)
  const value = params.get(key)
  return value ?? defaultValue
}

export function setUrlParam(
  keyOrData: string | Record<string, any>,
  value?: any,
  options?: { clear?: boolean; reset?: boolean }
) {
  console.log('[setUrlParam] keyOrData=%o value=%s options=%o', keyOrData, value, options)
  options = options || {}
  const { clear, reset } = options
  const params = reset ? new URLSearchParams() : new URLSearchParams(window.location.search)
  if (typeof keyOrData === 'string') {
    if (value == null && clear) {
      params.delete(keyOrData)
    } else {
      const key = keyOrData
      params.set(key, value)
    }
  } else {
    for (const [k, v] of Object.entries(keyOrData)) {
      if (v == null && clear) {
        params.delete(k)
      } else {
        params.set(k, String(v))
      }
    }
  }
  history.pushState(null, null, `?${params.toString()}`)
}

export function num(val: string | number, defaultValue?: any) {
  const original = val
  if (defaultValue == null) {
    defaultValue = original
  }
  if (val == null) {
    return defaultValue
  }
  if (typeof val === 'string') {
    val = Number(val)
  }
  if (typeof val !== 'number') {
    return defaultValue
  }
  if (!Number.isFinite(val)) {
    return defaultValue
  }
  return val
}

export function slug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

export function cleanName(str: string): string {
  if (typeof str !== 'string') {
    return ''
  }
  return str.toLowerCase().replace(/[^a-z0-9\[\]\(\)_-]/g, '')
}

// 1. Pre-generated distinct colors for small arrays (100 max)
const distinctPalette = d3.quantize(
  t => d3.hcl(t * 360, 60, 70), // HCL with fixed chroma/luminance
  100
)

// 2. Hash-based fallback for large N
function getHashedColor(index): string {
  const prime = 2654435761
  const hash = (index * prime) >>> 0
  const hue = hash % 360
  return d3.hcl(hue, 50, 65).formatHex()
}

// 3. Final function: picks from palette or generates dynamically
export function getColorForIndex(index, totalSize): string {
  if (totalSize <= 50) {
    return distinctPalette[index % distinctPalette.length].formatHex()
  } else {
    return getHashedColor(index)
  }
}

const currencyFormat = d3.format('$.2s')
export function formatCurrency(value: number): string {
  const formatted = currencyFormat(value)
  return formatted.toUpperCase().replace('G', 'B') // Giga → Billion
}

const currencyFormatPrecise = d3.format('$.3s')
/**
 * Same abbreviated style as formatCurrency but with three significant digits, for
 * headline figures where two rounds away real money: $2,156,329,966 reads "$2.2B" at
 * two digits and "$2.16B" at three. Axis ticks and tooltips stay on formatCurrency —
 * the extra digit is noise there.
 */
export function formatCurrencyPrecise(value: number): string {
  return currencyFormatPrecise(value).toUpperCase().replace('G', 'B')
}

const dollarsExact = d3.format('$,.0f')
/** Unabbreviated, comma-grouped dollars — for tables that quote a bill's exact figure. */
export function formatDollarsExact(value: number): string {
  return dollarsExact(value)
}

export interface DonutData {
  name: string
  value: number
  color?: string
  isHighlighted?: boolean
  mergedSegments?: { name: string; value: number }[]
}

export interface DetailData {
  name: string
  value: number
  color: string
  mergedSegments?: { name: string; value: number }[]
}

/**
 * Merges slices under the specified percentage threshold into an "Other" slice
 * @param data Array of donut data
 * @param threshold Percentage threshold (0-100) below which slices are merged
 * @param otherColor Color for the "Other" slice
 * @returns Array with small slices merged into "Other"
 */
export function mergeSmallSlices<T extends { name: string; value: number; color?: string }>(
  data: T[],
  threshold: number = 5,
  otherColor: string = '#ddd'
): T[] {
  if (data.length === 0) return data

  const total = d3.sum(data, d => d.value)
  const thresholdValue = (total * threshold) / 100

  const largeSlices: T[] = []
  let otherValue = 0
  const mergedSegments: { name: string; value: number }[] = []

  data.forEach(item => {
    if (item.value >= thresholdValue) {
      largeSlices.push(item)
    } else {
      otherValue += item.value
      mergedSegments.push({ name: item.name, value: item.value })
    }
  })

  // If we have small slices to merge, create the "Other" slice
  if (otherValue > 0) {
    const otherSlice = {
      name: 'Other',
      value: otherValue,
      color: otherColor,
      mergedSegments: mergedSegments
    } as unknown as T
    return [...largeSlices, otherSlice]
  }

  return largeSlices
}

export async function wait(ms: number = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
