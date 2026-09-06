import { fmtCount } from '../api'

export default function HomeView({ sessions, total, totalAnalyzed, onPick, onConfig }) {
  const top = [...sessions].sort((a, b) => (b.msg_count || 0) - (a.msg_count || 0)).slice(0, 6)
  return (
    <div className="home">
      <div className="hm-logo">Q</div>
      <h1>QChat Lens</h1>
      <div className="hm-tag">
        把 QQ / TIM 的聊天记录变成可检索、可回顾、可洞察的个人知识库。<br />
        原始消息永久保留，AI 在其上叠加标签、摘要与专题。
      </div>

      {sessions.length === 0 ? (
        <button className="btn-accent" style={{ fontSize: 13, padding: '9px 20px' }} onClick={onConfig}>
          ⚙ 配置并导入第一个会话
        </button>
      ) : (
        <div className="hm-cards">
          {top.map((s) => {
            const pct = s.msg_count ? Math.round((s.analyzed_count || 0) / s.msg_count * 100) : 0
            return (
              <div key={s.id} className="hm-card glass-card" onClick={() => onPick(s)}>
                <div className="hm-num">{fmtCount(s.msg_count)}<span style={{ fontSize: 13, color: 'var(--faint)' }}> 条</span></div>
                <div className="hm-lbl">{s.name || s.peer_id}</div>
                <div className="hm-act">{s.kind === 'group' ? '群聊' : '私聊'} · {pct}% 已分析 · {s.peer_id}</div>
              </div>
            )
          })}
        </div>
      )}
      {sessions.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span className="pill pill-grey" style={{ fontSize: 11.5 }}>共 {sessions.length} 会话 · {fmtCount(total)} 消息 · {totalAnalyzed} 已分析</span>
        </div>
      )}
    </div>
  )
}
