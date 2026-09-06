export default function Sidebar({ sessions, current, onPick, onConfig }) {
  const total = sessions.reduce((a, s) => a + s.msg_count, 0)
  const kindLabel = (k) => (k === 'group' ? '群' : '私')
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">Q</div>
        <div>
          <div className="brand-name">QChat Lens</div>
          <div className="brand-sub">会话洞察</div>
        </div>
      </div>
      <div className="side-stats">
        <div className="stat"><b>{sessions.length}</b><span>会话</span></div>
        <div className="stat"><b>{total}</b><span>消息</span></div>
      </div>
      <div className="side-title">会话列表</div>
      <div className="session-list">
        {sessions.length === 0 && <div className="empty">暂无会话<br /><span>先在顶部导入 QQ 历史</span></div>}
        {sessions.map((s) => (
          <div key={s.id}
               className={`session-item ${current && current.id === s.id ? 'active' : ''}`}
               onClick={() => onPick(s)}>
            <div className="s-avatar">{kindLabel(s.kind)}</div>
            <div className="s-info">
              <div className="s-name">{s.name || s.peer_id}</div>
              <div className="s-sub">{s.msg_count} 条消息</div>
            </div>
          </div>
        ))}
      </div>
      <div className="side-footer">
        <button className="ghost sm full" onClick={onConfig}>⚙ 配置 / 导入</button>
      </div>
    </aside>
  )
}
