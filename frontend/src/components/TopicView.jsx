import { useEffect, useState } from 'react'
import { get, fmtTs, fmtTsDate } from '../api'

export default function TopicView({ session }) {
  const [topics, setTopics] = useState([])
  const [open, setOpen] = useState(null) // topic id
  const [msgs, setMsgs] = useState([])

  useEffect(() => {
    get(`/api/sessions/${session.id}/topics`)
      .then((d) => setTopics(d.topics))
      .catch(() => {})
  }, [session.id])

  const openTopic = async (t) => {
    if (open === t.id) { setOpen(null); return }
    setOpen(t.id)
    try {
      const d = await get(`/api/topics/${t.id}`)
      setMsgs(d.messages)
    } catch { setMsgs([]) }
  }

  return (
    <div className="topic-view">
      <div className="topic-grid">
        {topics.length === 0 && (
          <div className="empty-panel">
            <div className="ep-title">还没有专题</div>
            <div className="ep-sub">点击"分析"让 AI 归纳这个会话的主题</div>
          </div>
        )}
        {topics.map((t) => (
          <div key={t.id} className={`topic-card ${open === t.id ? 'open' : ''}`}
               onClick={() => openTopic(t)}>
            <div className="tc-top">
              <div className="tc-title">{t.title}</div>
              <div className="tc-count">{t.msg_count} 条</div>
            </div>
            {t.summary && <div className="tc-sum">{t.summary}</div>}
            <div className="tc-meta">
              <span>{fmtTsDate(t.start_ts)}</span>
              {t.end_ts !== t.start_ts && <span> → {fmtTsDate(t.end_ts)}</span>}
            </div>
            {open === t.id && (
              <div className="tc-msgs" onClick={(e) => e.stopPropagation()}>
                {msgs.map((m) => (
                  <div key={m.id} className="tmsg">
                    <span className={`mc-who ${m.direction === 'out' ? 'me' : 'them'}`}>
                      {m.direction === 'out' ? '我' : (m.sender_name || '对方')}
                    </span>
                    <span className="tmsg-tx">{m.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
