import { useEffect, useState, useRef, useCallback } from 'react'
import { get } from '../api'
import MsgContent from './MsgContent'

const KIND_TABS = [
  { k: 'all', label: '全部' },
  { k: 'link', label: '链接', cls: 'blue' },
  { k: 'image', label: '图片', cls: 'green' },
  { k: 'file', label: '文件', cls: 'purple' },
  { k: 'voice', label: '语音', cls: 'orange' },
]

export default function MessageList({ session, filter, onFilter, tags, onSelect, selMsgId }) {
  const [msgs, setMsgs] = useState([])
  const [total, setTotal] = useState(0)
  const [byKind, setByKind] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [draft, setDraft] = useState(filter.q || '')
  const scrollRef = useRef(null)

  const { kind = 'all', tag = '', day = '', q = '' } = filter

  const afterRef = useRef(0)
  const load = useCallback(async (reset) => {
    setLoading(true)
    const after = reset ? 0 : afterRef.current
    try {
      const p = new URLSearchParams({ after: String(after), limit: '120' })
      if (kind !== 'all') p.set('kind', kind)
      if (tag) p.set('tag', tag)
      if (day) p.set('day', day)
      if (q) p.set('q', q)
      const d = await get(`/api/sessions/${session.id}/messages?${p}`)
      setMsgs((prev) => reset ? d.messages : [...prev, ...d.messages])
      afterRef.current = d.next_after
      setHasMore(d.has_more)
      if (after === 0) { setTotal(d.total || d.messages.length); setByKind(d.by_kind) }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [session.id, kind, tag, day, q])

  // 会话或任一过滤条件变化 -> 重置并重新加载，滚回顶部
  useEffect(() => {
    setDraft(q)
    afterRef.current = 0
    setMsgs([])
    load(true)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [session.id, kind, tag, day, q])

  const apply = (patch) => {
    onFilter({ ...filter, ...patch })
  }

  const submitSearch = () => {
    if (draft === q) return
    apply({ q: draft.trim(), kind })
  }

  const clearAll = () => onFilter({ kind: 'all', tag: '', day: '', q: '' })

  const hasFilter = kind !== 'all' || !!tag || !!day || !!q
  const groups = groupByDay(msgs)

  return (
    <div className="tl-pane">
      <div className="tl-filter">
        <div className="tl-kinds">
          {KIND_TABS.map((t) => (
            <button key={t.k}
                    className={`kbtn ${t.cls || ''} ${kind === t.k ? 'on' : ''}`}
                    title={t.label}
                    onClick={() => apply({ kind: t.k })}>
              <span className="kdot" />{t.label}
              {byKind && <em className="mono">{byKind[t.k] ?? ''}</em>}
            </button>
          ))}
        </div>

        <div className="tl-searchrow">
          <input className="tl-search" placeholder="搜索消息关键词… Enter"
                 value={draft}
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && submitSearch()} />
          <input className="tl-day" type="date" value={day || ''}
                 max={new Date().toISOString().slice(0, 10)}
                 title="按日期跳转"
                 onChange={(e) => apply({ day: e.target.value || '' })} />
          <button className="btn-ghost btn-sm" title="刷新" onClick={() => load(true)}>↻</button>
          {hasFilter && <button className="btn-soft btn-sm" onClick={clearAll}>清除过滤</button>}
        </div>

        {(tag || day) && (
          <div className="tl-chips">
            {day && <span className="chip">
              <b>日 {day}</b>
              <i onClick={() => apply({ day: '' })}>✕</i>
            </span>}
            {tag && <span className="chip chip-tag">
              <b>#{tag}</b>
              <i onClick={() => apply({ tag: '' })}>✕</i>
            </span>}
            {q && <span className="chip chip-q">
              <b>「{q}」</b>
              <i onClick={() => { apply({ q: '' }); setDraft('') }}>✕</i>
            </span>}
          </div>
        )}

        <div className="tl-count">
          {total > 0 && <span className="mono">{total} 条匹配</span>}
          {!hasFilter && total > 0 && <span className="faint">· 本会话全部消息</span>}
        </div>
      </div>

      <div className="tl-scroll" ref={scrollRef} onScroll={(e) => {
        const el = e.currentTarget
        if (el.scrollTop + el.clientHeight > el.scrollHeight - 160 && hasMore && !loading) load(false)
      }}>
        <div className="inner">
          {day && msgs.length > 0 && (
            <div className="day-pin">{day} · {msgs.length} 条{hasMore ? ' +' : ''}</div>
          )}
          {groups.map((g) => (
            <div className="day-group" key={g.day}>
              <div className="day-sep" onClick={() => apply({ day: g.day })} title="只看这一天">
                <span>{localizeDay(g.day)} · {g.msgs.length} 条</span>
              </div>
              {g.msgs.map((m) => (
                <MsgRow key={m.id} m={m} onClick={() => onSelect(m)} selected={selMsgId === m.id} />
              ))}
            </div>
          ))}
          {!loading && msgs.length === 0 && (
            <div className="tl-empty">
              {hasFilter ? '没有消息匹配当前条件' : '暂无消息'}
              {hasFilter && <button className="btn-soft btn-sm" onClick={clearAll} style={{ marginTop: 10 }}>清除过滤</button>}
            </div>
          )}
          {loading && <div className="load-more"><span className="spin" /></div>}
          {!loading && msgs.length > 0 && !hasMore && (
            <div className="load-more faint" style={{ fontSize: 11, padding: '18px 0 30px', textAlign: 'center' }}>—— 已到末尾 · 共 {total} 条 ——</div>
          )}
        </div>
      </div>
    </div>
  )
}

function MsgRow({ m, onClick, selected }) {
  const mine = m.direction === 'out'
  const links = extractLinks(m.text || '')
  const resCount = (m.resources || []).length
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
            {links.length > 0 && <span className="badge link">链接</span>}
            {resCount > 0 && <span className="badge file">{resCount} 资源</span>}
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

function extractLinks(text) {
  const m = (text || '').match(/https?:\/\/[^\s\u4e00-\u9fa5》】\]）,，。]+/g)
  return m ? m.slice(0, 2) : []
}

function localizeDay(key) {
  const [y, mo, d] = key.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  const today = new Date()
  const isToday = today.getFullYear() === y && today.getMonth() === mo - 1 && today.getDate() === d
  return isToday ? `${key} · 今天 · ${wd}` : `${key} · ${wd}`
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
