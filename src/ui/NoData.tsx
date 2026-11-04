// @ts-ignore
import src from '../assets/nodata.png'

export function NoData({ width }: { width: number }) {
  return <img src={src} alt="No data" style={{ opacity: 0.3, width }} />
}
