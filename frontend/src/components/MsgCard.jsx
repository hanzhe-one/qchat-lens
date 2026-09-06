export default function MsgCard({ m, onClick, selected }) {
  const mine = m.direction === 'out'
  const isLink = /https?:\/\//.test(m.text)
  const isFile = /\[(图片|文件|语音|视频)/.test(m.text)
  return (
    <div className={`msg-card ${mine ? 'mine' : ''} ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="mc-head">
        <span className={`mc-who ${mine ? 'me' : 'them'}`}>{mine ? '我' : (m.sender_name || '对方')}</span>
        <span className="mc-time">{fmt(m.ts)}</span>
        {isFile && <span className="badge file">附件</span>}
        {isLink && <span className="badge link">链接</span>}
      </div>
      <div className="mc-text">
        {m.msg_type === 'text' ? <>{shorten(m.text)}</> : <em className="media-line">{m.text}</em>}
      </div>
      {(m.tags || []).length > 0 && (
        <div className="mc-tags">
          {(m.tags || []).slice(0, 4).map((t) => <span key={t} className="micro-tag">{t}</span>)}
        </div>
      )}
    </div>
  )
}

function fmt(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function shorten(s, n = 160) {
  s = s || ''
  return s.length > n ? s.slice(0, n) + '…' : s
}
