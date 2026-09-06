import { useEffect, useState } from 'react'
import { get, fmtTsDate } from '../api'
import MsgContent from './MsgContent'

export default function TopicView({ session }) {
  const [topics, setTopics] = useState([])
  const [open, setOpen] = useState(null)
  const [msgs, setMsgs] = useState([])

  useEffect(() => {
    get(`/api/sessions/${session.id}/topics`).then((d) => setTopics(d.topics)).catch(() => {})
  }, [session.id])

  const toggle = async (t) => {
    if (open === t.id) { setOpen(null); return }
    setOpen(t.id)
    try { const d = await get(`/api/topics/${t.id}`); setMsgs(d.messages) } catch { setMsgs([]) }
  }

  return (
    <div className="topics">
      <div className="wrap">
        <div className="topic-grid">
          {topics.length === 0 && (
            <div className="topics-empty" style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 8 }}>还没有专题</div>
              <div style={{ fontSize: 12, color: 'var(--faint)' }}>回到「概览」点击「分析 / 重建专题」，让 AI 把时间线归纳成主题卡片</div>
            </div>
          )}
          {topics.map((t, i) => (
            <div key={t.id} className={`topic-card ${open === t.id ? 'open' : ''}`} onClick={() => toggle(t)}>
              <div className="tc-top">
                <span className="tc-rank">{String(i + 1).padStart(2, '0')}</span>
                <div className="tc-title">{t.title}</div>
                <span className="tc-count">{t.msg_count} 条</span>
              </div>
              {t.summary && <div className="tc-sum">{t.summary}</div>}
              <div className="tc-meta">
                <span>{fmtTsDate(t.start_ts)}</span>
                {t.end_ts !== t.start_ts && <span>→ {fmtTsDate(t.end_ts)}</span>}
              </div>
              {t.tags && t.tags.length > 0 && (
                <div className="tc-tags">{t.tags.slice(0, 6).map((x) => <span key={x} className="mtag">{x}</span>)}</div>
              )}
              {open === t.id && (
                <div className="tc-msgs" onClick={(e) => e.stopPropagation()}>
                  {msgs.map((m) => (
                    <div key={m.id} className="tmsg">
                      <div className="tmsg-head">
                        <span className={`who ${m.direction === 'out' ? 'me' : 'them'}`}>
                          {m.direction === 'out' ? '我' : (m.sender_name || '对方').slice(0, 4)}
                        </span>
                      </div>
                      <MsgContent text={m.text} resources={m.resources} size="md" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
