import { useEffect, useState } from 'react'
import { get, post, fmtTs } from '../api'
import MsgCard from './MsgCard'

export default function TimelineView({ session }) {
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(false)
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [tags, setTags] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [selMsg, setSelMsg] = useState(null)

  const load = async (reset) => {
    setLoading(true)
    const after = reset ? 0 : (msgs.length ? msgs[msgs.length - 1].id : 0)
    try {
      const params = new URLSearchParams({ after: String(after), limit: '100' })
      if (tag) params.set('tag', tag)
      if (q) params.set('q', q)
      const d = await get(`/api/sessions/${session.id}/messages?${params}`)
      if (reset) { setMsgs(d.messages); } else { setMsgs((p) => [...p, ...d.messages]) }
      setHasMore(d.has_more)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    setMsgs([]); setTag(''); setQ(''); setHasMore(false); setSelMsg(null)
    load(true)
  }, [session.id])

  useEffect(() => {
    get('/api/tags').then((d) => setTags(d.tags.filter(t => t.count > 0))).catch(() => {})
  }, [])

  return (
    <div className="timeline-wrap">
      <div className="tl-main">
        <div className="tl-tools">
          <input className="search" placeholder="搜索消息…" value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && load(true)} />
          <select className="tag-filter" value={tag} onChange={(e) => { setTag(e.target.value); setTimeout(() => load(true), 0) }}>
            <option value="">全部消息</option>
            {tags.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.count})</option>)}
          </select>
          <button className="ghost sm" onClick={() => load(true)}>刷新</button>
        </div>
        <div className="msg-list">
          {msgs.map((m) => (
            <MsgCard key={m.id} m={m} onClick={() => setSelMsg(m)} selected={selMsg && selMsg.id === m.id} />
          ))}
          {!loading && msgs.length === 0 && <div className="empty-mid">该条件无消息</div>}
          {hasMore && <div className="load-more"><button className="ghost sm" onClick={() => load(false)} disabled={loading}>加载更多</button></div>}
          {loading && <div className="load-more"><span className="spin" /></div>}
        </div>
      </div>
      {selMsg && <MsgDetail msg={selMsg} onClose={() => setSelMsg(null)} />}
    </div>
  )
}

function MsgDetail({ msg, onClose }) {
  const [editing, setEditing] = useState(false)
  const [tagText, setTagText] = useState('')
  const saveTags = async () => {
    const names = tagText.split(/[,，\s]+/).filter(Boolean)
    await post('/api/messages/tags', { msg_id: msg.id, tags: names, source: 'manual' })
    setEditing(false)
    alert('已保存标签')
  }
  return (
    <div className="detail-panel">
      <div className="dp-head">
        <b>消息详情</b>
        <button className="ghost sm" onClick={onClose}>✕</button>
      </div>
      <div className="dp-time">{fmtTs(msg.ts)}</div>
      <div className="dp-text">{msg.text}</div>
      <div className="dp-sec">
        <div className="dp-sec-title">标签</div>
        <div className="tag-cloud">
          {(msg.tags || []).map((t) => <span key={t} className="pill-tag">{t}</span>)}
        </div>
        {!editing ? (
          <button className="sec sm" onClick={() => { setTagText((msg.tags || []).join(' ')); setEditing(true) }}>编辑标签</button>
        ) : (
          <div>
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="空格分隔多个标签" className="full-input" />
            <div className="dp-actions">
              <button className="sm" onClick={saveTags}>保存</button>
              <button className="ghost sm" onClick={() => setEditing(false)}>取消</button>
            </div>
          </div>
        )}
      </div>
      <div className="dp-sec">
        <div className="dp-sec-title">原始数据</div>
        <details><summary>查看原始 JSON</summary>
          <pre className="raw-json">{JSON.stringify(msg.raw, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}
