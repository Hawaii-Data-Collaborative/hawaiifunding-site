// CPI-U Annual Averages (Bureau of Labor Statistics, via Minneapolis Fed)
// Base period: 1982-1984 = 100
// Source: https://www.minneapolisfed.org/about-us/monetary-policy/inflation-calculator/consumer-price-index-1913-
export const CPI: Record<number, number> = {
  2000: 172.2,
  2001: 177.1,
  2002: 179.9,
  2003: 184.0,
  2004: 188.9,
  2005: 195.3,
  2006: 201.6,
  2007: 207.3,
  2008: 215.3,
  2009: 214.5,
  2010: 218.1,
  2011: 224.9,
  2012: 229.6,
  2013: 233.0,
  2014: 236.7,
  2015: 237.0,
  2016: 240.0,
  2017: 245.1,
  2018: 251.1,
  2019: 255.7,
  2020: 258.8,
  2021: 271.0,
  2022: 292.7,
  2023: 304.7,
  2024: 313.7,
  2025: 321.9 // estimate based on Q4 2024
}

const BASE_YEAR = 2025

/**
 * Adjust a dollar value for inflation to the base year (2025 dollars).
 * For years without CPI data (e.g. future), returns the unadjusted value.
 */
export function adjustForInflation(value: number, fiscalYear: number): number {
  const baseCpi = CPI[BASE_YEAR]
  const yearCpi = CPI[fiscalYear]
  if (!baseCpi || !yearCpi) return value
  return value * (baseCpi / yearCpi)
}
