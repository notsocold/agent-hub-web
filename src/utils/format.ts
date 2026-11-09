import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = dayjs(iso)
  if (!date.isValid()) return ''
  const now = dayjs()
  if (date.isSame(now, 'day')) return date.format('HH:mm')
  if (date.isSame(now.subtract(1, 'day'), 'day')) return '昨天'
  if (date.isAfter(now.subtract(7, 'day'))) return date.format('dddd')
  return date.format('MM-DD')
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = dayjs(iso)
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : '—'
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = dayjs(iso)
  return date.isValid() ? date.format('HH:mm:ss') : '—'
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
