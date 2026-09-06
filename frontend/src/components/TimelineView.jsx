import { useEffect, useState } from 'react'
import { get, post } from '../api'
import MessageList from './MessageList'
import MsgContent from './MsgContent'

export default function TimelineView({ session, filter, onFilter }) {
  const [tags, setTags] = useState([])
  const [sel, setSel] = useState(null)

  useEffect(() => {
    get(`/api/sessions/${session.id}/tags`)
      .then((d) => setTags(d.tags))
      .catch(() => {})
  }, [session.id])

  return (
    <div className="timeline">
      <MessageList session={session} filter={filter} onFilter={onFilter}
                   tags={tags} onSelect={setSel} selMsgId={sel?.id} />
      {sel && <MsgDetail msg={sel} tags={tags} onPickTag={(t) => onFilter({ ...filter, tag: t })} onClose={() => setSel(null)} />}
    </div>
  )
}

function MsgDetail({ msg, tags, onPickTag, onClose }) {
  const [editing, setEditing] = useState(false)
  const [tagText, setTagText] = useState('')
  const mine = msg.direction === 'out'

  const addTag = async (name) => {
    try {
      const cur = [...new Set([...(msg.tags || []), name])]
      await post('/api/messages/tags', { msg_id: msg.id, tags: cur, source: 'manual' })
      msg.tags = cur
    } catch (e) { alert('保存失败: ' + e.message) }
  }
  const saveTags = async () => {
    try {
      const names = [...new Set(tagText.split(/[,，\s]+/).filter(Boolean))]
      await post('/api/messages/tags', { msg_id: msg.id, tags: names, source: 'manual' })
      msg.tags = names
      setEditing(false)
    } catch (e) { alert('保存失败: ' + e.message) }
  }

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
          {(msg.tags || []).map((t) => (
            <span key={t} className="dtag" title="查看带此标签的所有消息" onClick={() => onPickTag(t)}>{t}</span>
          ))}
          {(msg.tags || []).length === 0 && <span className="faint" style={{ fontSize: 11 }}>暂无标签 · 可从下方会话标签添加</span>}
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="faint" style={{ fontSize: 10.5, marginBottom: 6 }}>会话已有标签 · 点击加入本消息</div>
          <div className="dd-tagcloud">
            {(tags || []).slice(0, 40).map((t) => {
              const has = (msg.tags || []).includes(t.name)
              return (
                <button key={t.name} className={`mtag mtag-btn ${has ? 'on' : ''}`}
                        onClick={() => (has ? onPickTag(t.name) : addTag(t.name))}>
                  {t.name} <em>{has ? '查看→' : '+'}</em>
                </button>
              )
            })}
          </div>
        </div>

        <div className="dd-actions" style={{ marginTop: 12 }}>
          {!editing ? (
            <button className="btn-soft btn-sm" onClick={() => { setTagText((msg.tags || []).join(' ')); setEditing(true) }}>✎ 自定义标签</button>
          ) : (
            <>
              <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="空格分隔多个标签" autoFocus style={{ flex: 1 }} />
              <button className="btn-accent btn-sm" onClick={saveTags}>保存</button>
              <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>取消</button>
            </>
          )}
        </div>
      </div>

      <details className="dd-details">
        <summary>查看原始数据 JSON</summary>
        <pre className="raw-json" style={{ marginTop: 8 }}>{JSON.stringify(msg.raw, null, 2)}</pre>
      </details>
    </div>
  )
}
