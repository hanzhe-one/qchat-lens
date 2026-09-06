import { useEffect, useState } from 'react'
import { get, post } from '../api'
import MessageList from './MessageList'
import MsgContent from './MsgContent'

export default function TimelineView({ session }) {
  const [tags, setTags] = useState([])
  const [sel, setSel] = useState(null)

  useEffect(() => {
    get(`/api/sessions/${session.id}/tags`)
      .then((d) => setTags(d.tags.slice(0, 40)))
      .catch(() => {})
  }, [session.id])

  return (
    <div className="timeline">
      <MessageList session={session} tags={tags} onSelect={setSel} selMsgId={sel?.id} />
      {sel && <MsgDetail msg={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

function MsgDetail({ msg, onClose }) {
  const [editing, setEditing] = useState(false)
  const [tagText, setTagText] = useState('')
  const saveTags = async () => {
    try {
      const names = tagText.split(/[,，\s]+/).filter(Boolean)
      await post('/api/messages/tags', { msg_id: msg.id, tags: names, source: 'manual' })
      msg.tags = names
      setEditing(false)
    } catch (e) { alert('保存失败: ' + e.message) }
  }
  const mine = msg.direction === 'out'
  return (
    <div className="detail-drawer">
      <div className="dd-head"><b>消息详情</b>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>
      <div className="dd-time">#{msg.id} · {new Date(msg.ts).toLocaleString()} · {mine ? '我方' : msg.sender_name}</div>

      <div className="dd-card">
        <MsgContent text={msg.text} resources={msg.resources} size="lg" />
      </div>

      <div className="dd-card">
        <div className="dd-sec-title">标签</div>
        <div className="dd-tagcloud">
          {(msg.tags || []).map((t) => <span key={t} className="dtag">{t}</span>)}
          {(msg.tags || []).length === 0 && <span className="faint" style={{ fontSize: 11 }}>暂无标签</span>}
        </div>
        {!editing ? (
          <button className="btn-soft btn-sm" onClick={() => { setTagText((msg.tags || []).join(' ')); setEditing(true) }}>✎ 编辑标签</button>
        ) : (
          <>
            <div className="dd-edit-row">
              <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="空格分隔多个标签" autoFocus />
            </div>
            <div className="dd-actions">
              <button className="btn-accent btn-sm" onClick={saveTags}>保存</button>
              <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>取消</button>
            </div>
          </>
        )}
      </div>

      <details className="dd-details">
        <summary>查看原始数据 JSON</summary>
        <pre className="raw-json" style={{ marginTop: 8 }}>{JSON.stringify(msg.raw, null, 2)}</pre>
      </details>
    </div>
  )
}
