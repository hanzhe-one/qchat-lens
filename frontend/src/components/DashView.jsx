import { useEffect, useState } from 'react'
import { get, post, fmtTsDate, heatmapGrid, levelOf, fmtCount } from '../api'
import MsgContent from './MsgContent'

export default function DashView({ session, onGoto }) {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState(null)
  const [tags, setTags] = useState([])
  const [topics, setTopics] = useState([])
  const [recent, setRecent] = useState([])
  const [live, setLive] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const s = await get(`/api/sessions/${session.id}/stats`)
      setStats(s)
      setTags((s.tags || []).slice(0, 60))
    } catch (e) {}
    try {
      const a = await get(`/api/sessions/${session.id}/activity?days=365`)
      setActivity(a.activity)
    } catch (e) {}
    try {
      const t = await get(`/api/sessions/${session.id}/topics`)
      setTopics(t.topics.slice(0, 6))
    } catch (e) {}
    try {
      const m = await get(`/api/sessions/${session.id}/messages?after=0&limit=8`)
      setRecent(m.messages)
    } catch (e) {}
  }

  useEffect(() => { load() }, [session.id])

  const startAnalyze = async () => {
    setBusy(true)
    try {
      await post('/api/analyze', { session_id: session.id, build_topics: true })
      poll()
    } catch (e) { alert('分析失败: ' + e.message); setBusy(false) }
  }

  const poll = () => {
    const t = setInterval(async () => {
      try {
        const s = await get('/api/analyze/status')
        setLive(s)
        if (!s.running) { clearInterval(t); setBusy(false); load() }
      } catch { clearInterval(t); setBusy(false) }
    }, 2500)
  }

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await get('/api/analyze/status')
        setLive(s.running ? s : null)
      } catch (e) {}
    }, 4000)
    return () => clearInterval(t)
  }, [])

  if (!stats) return <div className="dash"><div className="wrap" style={{ padding: 60, textAlign: 'center' }}><span className="spin" /></div></div>

  const st = stats.stats
  const grid = activity ? heatmapGrid(activity, 26) : []
  const maxDay = activity ? Math.max(1, ...Object.values(activity)) : 1
  const pct = st.total ? Math.round((st.analyzed || 0) / st.total * 100) : 0

  return (
    <div className="dash">
      <div className="wrap">
        {live && live.running && (
          <div className="analyze-bar glass-card">
            <span className="spin" />
            <span className="ab-tx">AI 分析进行中… 已处理 <b className="mono" style={{ color: 'var(--accent)' }}>{live.done}</b> 条消息</span>
            <div className="ab-prog"><i style={{ width: st.total ? Math.min(100, live.done / st.total * 100) + '%' : '2%' }} /></div>
            <span className="ab-num">{live.error ? '⚠ ' + live.error.slice(0, 40) : ''}</span>
          </div>
        )}

        <div className="hero">
          <div className="hero-info">
            <div className="h-name">{session.name || session.peer_id}</div>
            <div className="h-meta">
              {session.kind === 'group' ? '群聊' : '私聊'} · uin {session.peer_id} · {fmtTsDate(st.first_ts)} → {fmtTsDate(st.last_ts)}
            </div>
            <div className="hero-actions">
              <button className="btn-accent" onClick={startAnalyze} disabled={busy || (live && live.running)}>
                {busy || (live && live.running) ? <span className="spin" /> : '▶ 分析 / 重建专题'}
              </button>
              <button className="btn-ghost" onClick={() => onGoto('timeline')}>消息</button>
              <button className="btn-ghost" onClick={() => onGoto('topics')}>专题</button>
            </div>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><b>{fmtCount(st.total)}<span className="unit">条</span></b><span>消息</span></div>
            <div className="hero-stat"><b>{st.analyzed || 0}<span className="unit">条</span></b><span>已分析</span></div>
            <div className="hero-stat"><b>{tags.length}<span className="unit"></span></b><span>标签</span></div>
            <div className="hero-stat"><b>{pct}%</b><span>进度</span></div>
          </div>
        </div>

        <div className="dash-row">
          <div className="dash-card glass-card full">
            <div className="dc-head"><h3>活动热力图</h3>
              <div className="dc-extra"><span className="pill pill-grey">近 26 周 · 消息量</span></div>
            </div>
            {grid.length ? (
              <>
                <div className="heatmap">
                  {grid.map((col, ci) => (
                    <div className="hm-col" key={ci}>
                      {col.map((c) => (
                        <div key={c.key} className={`hm-cell l${levelOf(c.val, maxDay)}`}
                             title={`${c.date} · ${c.val} 条`} />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="hm-axis"><span>更早</span><span>最近</span></div>
              </>
            ) : <div className="muted" style={{ padding: 12 }}>暂无消息活动数据</div>}
          </div>
        </div>

        <div className="dash-row">
          <div className="dash-card glass-card">
            <div className="dc-head"><h3>多维标签</h3>
              <div className="dc-extra">
                <button className="btn-ghost btn-sm" onClick={() => onGoto('timeline')}>按标签浏览 →</button>
              </div>
            </div>
            <div className="tag-cloud">
              {tags.length === 0 && <div className="muted" style={{ padding: 8 }}>尚未分析。点「分析 / 重建专题」让 AI 打标签。</div>}
              {tags.map((t, i) => (
                <span key={t.id} className={`tag-chip ${i % 3 === 2 ? 'purple' : (i % 5 === 3 ? 'blue' : '')}`}>
                  {t.name}<em>{t.count}</em>
                </span>
              ))}
            </div>
          </div>

          <div className="dash-card glass-card">
            <div className="dc-head"><h3>专题预览</h3>
              <div className="dc-extra"><button className="btn-ghost btn-sm" onClick={() => onGoto('topics')}>全部 →</button></div>
            </div>
            <div className="topic-preview-list">
              {topics.length === 0 && <div className="muted" style={{ padding: 8 }}>暂无专题</div>}
              {topics.map((t, i) => (
                <div className="topic-mini" key={t.id} onClick={() => onGoto('topics')}>
                  <div className="t-dot" style={i % 3 ? {} : { background: 'var(--purple)' }} />
                  <div className="t-tx">
                    <div className="t-name">{t.title}</div>
                    <div className="t-sub">{fmtTsDate(t.start_ts)}{t.end_ts !== t.start_ts ? ' → ' + fmtTsDate(t.end_ts) : ''}</div>
                  </div>
                  <div className="t-count">{t.msg_count} 条</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dash-row">
          <div className="dash-card glass-card">
            <div className="dc-head"><h3>最近消息</h3></div>
            <div className="recent-list">
              {recent.map((m) => (
                <div key={m.id} className="recent-msg" onClick={() => onGoto('timeline')} style={{ cursor: 'pointer' }}>
                  <span className={`rm-who ${m.direction === 'out' ? 'me' : 'them'}`}>
                    {m.direction === 'out' ? '我' : (m.sender_name || '对方').slice(0, 5)}
                  </span>
                  <span className="rm-tx" style={{ overflow: 'visible', whiteSpace: 'normal', lineHeight: 1.5 }}>
                    <MsgContent text={m.text} resources={m.resources} size="md" />
                  </span>
                  <span className="rm-t">{fmtTsDate(m.ts)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="dash-card glass-card">
            <div className="dc-head"><h3>说明</h3></div>
            <div className="hint" style={{ marginBottom: 8 }}>
              原始消息与数据永久保存在本机 SQLite，AI 分析（标签/摘要/专题）只是叠加层，随时可重建。
            </div>
            <div className="hint">
              点右上「配置 / 导入」可同步更多会话；实时新消息到达后，点「分析 / 重建专题」增量消费。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
