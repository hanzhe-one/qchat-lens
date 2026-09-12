const THEMES = [
  { id: 'dark', name: '黑色' },
  { id: 'light', name: '白色' },
]

export default function Sidebar({ sessions, current, total, totalAnalyzed, onPick, onHome, onInbox, onConfig, theme, onTheme, workspaceView }) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={onHome} aria-label="返回 QChat Lens 首页">
        <div className="brand-mark">Q</div>
        <div className="brand-t">
          <div className="brand-name">QChat Lens</div>
          <div className="brand-sub">个人信息收集与知识整理</div>
        </div>
      </button>

      <nav className="side-nav" aria-label="主导航">
        <div className="side-sec-title">知识库</div>
        <button className={`side-nav-item ${workspaceView === 'inbox' ? 'active' : ''}`} onClick={onInbox}>
          <span className="side-nav-icon">⌁</span>
          <span>收集箱</span>
          <span className="side-nav-count">6</span>
        </button>
        <button className="side-nav-item" disabled>
          <span className="side-nav-icon">◇</span>
          <span>全部知识</span>
          <span className="side-nav-soon">即将上线</span>
        </button>
        <button className={`side-nav-item ${workspaceView === 'sources' && !current ? 'active' : ''}`} onClick={onHome}>
          <span className="side-nav-icon">⌘</span>
          <span>信息源</span>
          <span className="side-nav-count">{sessions.length}</span>
        </button>
      </nav>

      <div className="side-sec-title side-source-title">QQ / TIM 会话</div>
      <div className="session-list">
        {sessions.length === 0 && (
          <div className="side-empty">还没有导入信息源<br />点击下方「配置 / 导入」同步聊天历史</div>
        )}
        {sessions.map((s) => {
          const pct = s.msg_count ? Math.round((s.analyzed_count || 0) / s.msg_count * 100) : 0
          const active = current && current.id === s.id
          return (
            <button key={s.id} className={`session-item ${active ? 'active' : ''}`} onClick={() => onPick(s)}>
              <span className={`s-avatar ${s.kind === 'group' ? 'group' : ''}`}>
                {s.kind === 'group' ? '群' : (s.name || '?').slice(0, 1)}
              </span>
              <span className="s-info">
                <span className="s-name">{s.name || s.peer_id}</span>
                <span className="s-sub">{s.msg_count} 条 · {pct}% 已分析</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="side-summary">
        <span>{total.toLocaleString()} 条原始消息</span>
        <span>{totalAnalyzed.toLocaleString()} 条已分析</span>
      </div>
      <div className="theme-picker" aria-label="外观主题">
        <span className="theme-picker-label">外观</span>
        <div className="theme-options">
          {THEMES.map((item) => (
            <button
              key={item.id}
              className={`theme-option ${theme === item.id ? 'active' : ''}`}
              aria-label={`切换到${item.name}主题`}
              aria-pressed={theme === item.id}
              onClick={() => onTheme(item.id)}
            >
              <span className={`theme-preview theme-${item.id}`} />
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="side-footer">
        <button className="btn-ghost btn-sm" onClick={onConfig}>配置 / 导入</button>
      </div>
    </aside>
  )
}
