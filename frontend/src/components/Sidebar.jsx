export default function Sidebar({ sessions, current, total, totalAnalyzed, onPick, onConfig }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">Q</div>
        <div className="brand-t">
          <div className="brand-name">QChat Lens</div>
          <div className="brand-sub">qq conversation lens</div>
        </div>
      </div>

      <div className="side-stats">
        <div className="stat-card"><b>{sessions.length}</b><span>会话</span></div>
        <div className="stat-card"><b>{total}</b><span>消息</span></div>
        <div className="stat-card"><b>{totalAnalyzed}</b><span>已分析</span></div>
        <div className="stat-card"><b>{total ? Math.round(totalAnalyzed / total * 100) : 0}%</b><span>进度</span></div>
      </div>

      <div className="side-sec-title">会话</div>
      <div className="session-list">
        {sessions.length === 0 && (
          <div className="side-empty">还没有导入会话<br />点击下方「配置 / 导入」<br />同步 QQ 聊天历史</div>
        )}
        {sessions.map((s) => {
          const pct = s.msg_count ? Math.round((s.analyzed_count || 0) / s.msg_count * 100) : 0
          const active = current && current.id === s.id
          return (
            <div key={s.id} className={`session-item ${active ? 'active' : ''}`} onClick={() => onPick(s)}>
              <div className={`s-avatar ${s.kind === 'group' ? 'group' : ''}`}>
                {s.kind === 'group' ? '群' : (s.name || '?').slice(0, 1)}
              </div>
              <div className="s-info">
                <div className="s-name">{s.name || s.peer_id}</div>
                <div className="s-sub">{s.msg_count} 条 · {s.peer_id}</div>
              </div>
              <div className="s-analyze" title={`${pct}% 已分析`}>
                <div className="fill"><i style={{ width: pct + '%' }} /></div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="side-footer">
        <button className="btn-ghost btn-sm" onClick={onConfig}>⚙ 配置 / 导入</button>
      </div>
    </aside>
  )
}
