import { formatEuro } from '../money'

/** Small, locale-aware formatters shared by the monitoring cards. */

const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

export function formatTemperature(celsius: number): string {
  return `${decimal.format(celsius)} °C`
}

export function formatCount(value: number): string {
  return whole.format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${whole.format(Math.round(bytes / 1024))} KB`
  }
  return `${decimal.format(bytes / (1024 * 1024))} MB`
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export { formatEuro }
