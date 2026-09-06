import { useEffect, useState, useRef } from 'react'
import { get } from '../api'
import MsgContent from './MsgContent'

export default function MessageList({ session, tags, onSelect, selMsgId }) {
  const [msgs, setMsgs] = useState([])
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const scrollRef = useRef(null)

  const load = async (reset) => {
    setLoading(true)
    const after = reset ? 0 : (msgs.length ? msgs[msgs.length - 1].id : 0)
    try {
      const p = new URLSearchParams({ after: String(after), limit: '120' })
      if (tag) p.set('tag', tag)
      if (q) p.set('q', q)
      const d = await get(`/api/sessions/${session.id}/messages?${p}`)
      setMsgs((prev) => reset ? d.messages : [...prev, ...d.messages])
      setHasMore(d.has_more)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { setMsgs([]); setTag(''); setQ(''); setHasMore(false); load(true) }, [session.id])

  const doSearch = () => { setMsgs([]); load(true) }

  const groups = groupByDay(msgs)

  return (
    <div className="tl-pane">
      <div className="tl-toolbar">
        <input className="tl-search" placeholder="搜索消息关键词… Enter 执行"
               value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        <select className="tl-filter" value={tag}
                onChange={(e) => { setTag(e.target.value); setTimeout(() => { setMsgs([]); load(true) }, 0) }}>
          <option value="">全部标签</option>
          {tags.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
        </select>
        <button className="btn-ghost btn-sm" onClick={() => { setMsgs([]); load(true) }}>↻</button>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
          {msgs.length > 0 && <>已加载 {msgs.length} 条{hasMore ? ' · ↓ 滚到底加载更多' : ' · 全部'}</>}
        </div>
      </div>
      <div className="tl-scroll" ref={scrollRef} onScroll={(e) => {
        const el = e.currentTarget
        if (el.scrollTop + el.clientHeight > el.scrollHeight - 140 && hasMore && !loading) load(false)
      }}>
        <div className="inner">
          {groups.map((g) => (
            <div className="day-group" key={g.day}>
              <div className="day-sep">{g.day} · {g.msgs.length} 条</div>
              {g.msgs.map((m) => (
                <MsgRow key={m.id} m={m} onClick={() => onSelect(m)} selected={selMsgId === m.id} />
              ))}
            </div>
          ))}
          {!loading && msgs.length === 0 && <div className="tl-empty">没有消息匹配当前条件</div>}
          {loading && <div className="load-more"><span className="spin" /></div>}
        </div>
      </div>
    </div>
  )
}

function MsgRow({ m, onClick, selected }) {
  const mine = m.direction === 'out'
  const hasUrl = /https?:\/\//i.test(m.text || '')
  const hasRes = (m.resources || []).length > 0
  const t = new Date(m.ts)
  const p = (n) => String(n).padStart(2, '0')
  const time = `${p(t.getHours())}:${p(t.getMinutes())}`
  return (
    <div className="msg-row">
      <div className={`msg-ava ${mine ? 'me' : 'them'}`}>{mine ? '我' : (m.sender_name || '?').slice(0, 1)}</div>
      <div className={`msg-bub ${selected ? 'selected' : ''}`} onClick={onClick}>
        <div className="msg-head">
          <span className={`msg-who ${mine ? 'me' : 'them'}`}>{mine ? '我' : (m.sender_name || '对方')}</span>
          <span className="msg-time">{time}</span>
          <span className="msg-badges">
            {hasUrl && <span className="badge link">链接</span>}
            {hasRes && <span className="badge file">{(m.resources || []).length} 资源</span>}
          </span>
        </div>
        <MsgContent text={m.text} resources={m.resources} size="md" />
        {(m.tags || []).length > 0 && (
          <div className="msg-tags">{(m.tags || []).slice(0, 6).map((t2) => <span key={t2} className="mtag">{t2}</span>)}</div>
        )}
      </div>
    </div>
  )
}

function groupByDay(msgs) {
  const map = {}
  for (const m of msgs) {
    const d = new Date(m.ts)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    ;(map[key] = map[key] || []).push(m)
  }
  return Object.entries(map).map(([day, list]) => ({ day, msgs: list }))
}

