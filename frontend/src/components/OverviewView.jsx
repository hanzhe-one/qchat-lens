import { useEffect, useState } from 'react'
import { get, post, fmtTsDate } from '../api'

export default function OverviewView({ current, onGoto }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState({ running: false, done: 0, error: null })

  useEffect(() => {
    if (!current) return
    setData(null)
    get(`/api/sessions/${current.id}/stats`).then(setData).catch(() => {})
  }, [current])

  const runAnalyze = async () => {
    setBusy(true)
    try {
      await post('/api/analyze', { session_id: current.id, build_topics: true })
      pollStatus()
    } catch (e) { alert('分析失败: ' + e.message); setBusy(false) }
  }

  const pollStatus = async () => {
    const t = setInterval(async () => {
      try {
        const s = await get('/api/analyze/status')
        setLive(s)
        if (!s.running) {
          clearInterval(t)
          setBusy(false)
          const d = await get(`/api/sessions/${current.id}/stats`)
          setData(d)
        }
      } catch { clearInterval(t); setBusy(false) }
    }, 3000)
  }

  if (!current) {
    // 全局概览（未选会话）
    return <EmptyHome />
  }
  if (!data) return <div className="center-mid"><span className="spin" /></div>

  const st = data.stats
  const topTags = (data.tags || []).slice(0, 40)
  return (
    <div className="overview">
      <div className="ov-hero">
        <div className="ov-name">{current.name || current.peer_id}</div>
        <div className="ov-stats">
          <div className="ov-stat"><b>{st.total}</b><span>消息总数</span></div>
          <div className="ov-stat"><b>{st.analyzed || 0}</b><span>已分析</span></div>
          <div className="ov-stat"><b>{topTags.length}</b><span>标签</span></div>
          <div className="ov-stat"><b>{data.topics_count ?? '–'}</b><span>专题</span></div>
        </div>
        <div className="ov-range">
          {fmtTsDate(st.first_ts)} → {fmtTsDate(st.last_ts)}
        </div>
        <div className="ov-actions">
          <button onClick={runAnalyze} disabled={busy || live.running}>
            {busy || live.running ? <span className="spin" /> : '▶ 开始 AI 分析'}
          </button>
          <button className="ghost" onClick={() => onGoto && onGoto('timeline')}>浏览消息</button>
          <button className="ghost" onClick={() => onGoto && onGoto('topics')}>查看专题</button>
        </div>
        {live.running && <div className="analyze-note">分析中… 已处理 {live.done} 条{live.error ? ` · 错误: ${live.error}` : ''}</div>}
      </div>
      <div className="ov-body">
        <div className="ov-card">
          <div className="ov-card-title">多维标签</div>
          <div className="big-tag-cloud">
            {topTags.map((t) => (
              <span key={t.id} className="big-tag" title={`${t.count} 条消息`}>
                {t.name}<em>{t.count}</em>
              </span>
            ))}
            {topTags.length === 0 && <div className="muted">尚未分析，点击"开始 AI 分析"</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyHome() {
  const [sessions, setSessions] = useState([])
  useEffect(() => { get('/api/sessions').then((d) => setSessions(d.sessions)).catch(() => {}) }, [])
  return (
    <div className="empty-home">
      <div className="eh-logo">Q</div>
      <h1>QChat Lens</h1>
      <p>导入你的 QQ 聊天记录，让 AI 帮你归类、检索、回顾。</p>
      {sessions.length === 0 ? (
        <div className="eh-tip">还没有导入任何会话 — 点击左下角「配置 / 导入」开始</div>
      ) : (
        <div className="eh-tip">从左侧选择一个会话开始探索</div>
      )}
    </div>
  )
}
