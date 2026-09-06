import { useEffect, useState } from 'react'
import { get, fmtTsDate, fmtTs, fmtCount } from '../api'
import MsgContent from './MsgContent'

export default function TopicView({ session, onExplore }) {
  const [topics, setTopics] = useState([])
  const [openId, setOpenId] = useState(null)   // 当前浮窗展示的专题
  const [mini, setMini] = useState(false)      // 浮窗是否被折叠
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    get(`/api/sessions/${session.id}/topics`).then((d) => setTopics(d.topics)).catch(() => {})
  }, [session.id])

  // 打开/恢复 某个专题的浮窗
  const openTopic = async (t) => {
    if (openId === t.id && !mini) { setOpenId(null); return }
    setOpenId(t.id)
    setMini(false)
    if (openId !== t.id || !msgs.length) {
      setLoading(true)
      try { const d = await get(`/api/topics/${t.id}`); setMsgs(d.messages) } catch { setMsgs([]) }
      setLoading(false)
    }
  }

  const active = topics.find((t) => t.id === openId) || null

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
            <button key={t.id} className={`topic-card ${openId === t.id ? 'open' : ''}`} onClick={() => openTopic(t)}>
              <span className="tc-top">
                <span className="tc-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="tc-title">{t.title}</span>
                <span className="tc-count">{fmtCount(t.msg_count)} 条</span>
              </span>
              {t.summary && <span className="tc-sum">{t.summary}</span>}
              <span className="tc-meta">
                <span>{fmtTsDate(t.start_ts)}</span>
                {t.end_ts !== t.start_ts && <span>→ {fmtTsDate(t.end_ts)}</span>}
              </span>
              {t.tags && t.tags.length > 0 && (
                <span className="tc-tags">
                  {t.tags.slice(0, 6).map((x) => (
                    <span key={x} className="mtag">{x}</span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {active && !mini && (
        <>
          <div className="topic-backdrop" onClick={() => setOpenId(null)} />
          <div className="topic-float">
            <div className="tf-head">
              <div className="tf-title">
                <span className="tf-dot" />
                <b>{active.title}</b>
                <span className="tf-count mono">{fmtCount(active.msg_count)} 条</span>
              </div>
              <div className="tf-actions">
                {onExplore && (
                  <button className="btn-soft btn-sm" title="在消息流里查看这一天"
                          onClick={() => onExplore({ day: fmtTsDate(active.start_ts) })}>
                    在消息流查看
                  </button>
                )}
                <button className="btn-icon" title="折叠" onClick={() => setMini(true)}>—</button>
                <button className="btn-icon" title="关闭" onClick={() => setOpenId(null)}>✕</button>
              </div>
            </div>
            <div className="tf-meta">
              <span className="faint mono">{fmtTs(active.start_ts)}{active.end_ts !== active.start_ts ? ' ~ ' + fmtTs(active.end_ts) : ''}</span>
            </div>
            {active.summary && <div className="tf-sum">{active.summary}</div>}
            {active.tags && active.tags.length > 0 && (
              <div className="tf-tags">
                {active.tags.map((x) => (
                  <button key={x} className="mtag mtag-btn" onClick={() => onExplore && onExplore({ tag: x })}>{x}</button>
                ))}
              </div>
            )}
            <div className="tf-body">
              {loading && <div className="load-more"><span className="spin" /></div>}
              {!loading && msgs.map((m) => (
                <div key={m.id} className="tmsg">
                  <div className="tmsg-head">
                    <span className={`who ${m.direction === 'out' ? 'me' : 'them'}`}>
                      {m.direction === 'out' ? '我' : (m.sender_name || '对方').slice(0, 4)}
                    </span>
                    <span className="tmsg-date mono">{fmtTs(m.ts)}</span>
                  </div>
                  <MsgContent text={m.text} resources={m.resources} size="md" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 折叠后的恢复条 */}
      {active && mini && (
        <button className="topic-float-tab" onClick={() => setMini(false)}>
          <span className="tf-dot" />
          <b>{active.title}</b>
          <span className="mono">· {fmtCount(active.msg_count)} 条</span>
          <span className="tft-close" onClick={(e) => { e.stopPropagation(); setOpenId(null) }}>✕</span>
        </button>
      )}
    </div>
  )
}
