// 后端 API 封装
const BASE = ''

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || r.statusText)
  return data
}

export const get = (p) => api(p)
export const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) })

export function fmtTs(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtTsDate(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fmtCount(n) {
  if (n == null) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// 把 {day: count} 转成 52×7 周热力图矩阵 (col=week, row=weekday)
export function heatmapGrid(activity, weeks = 26) {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayMs = 86400000
  const days = weeks * 7
  const start = new Date(end.getTime() - (days - 1) * dayMs)
  // 补齐到周一开头
  const dow = (start.getDay() + 6) % 7 // Mon=0
  const gridStart = new Date(start.getTime() - dow * dayMs)
  const cols = []
  let cur = new Date(gridStart)
  while (cur <= end) {
    const col = []
    for (let i = 0; i < 7; i++) {
      const key = fmtKey(cur)
      const val = activity[key] || 0
      col.push({ date: fmtTsDate(cur.getTime()), key, val })
      cur = new Date(cur.getTime() + dayMs)
    }
    cols.push(col)
  }
  return cols
}

function fmtKey(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function levelOf(val, max) {
  if (val <= 0) return 0
  const r = val / (max || 1)
  if (r < 0.25) return 1
  if (r < 0.5) return 2
  if (r < 0.8) return 3
  return 4
}

export function resUrl(r) {
  return `/api/resource?path=${encodeURIComponent(r.path)}`
}

export function resDownload(r) {
  return `/api/resource?path=${encodeURIComponent(r.path)}&download=1`
}
