import { fmtCount } from '../api'

export default function HomeView({ sessions, total, totalAnalyzed, onPick, onConfig }) {
  const top = [...sessions].sort((a, b) => (b.msg_count || 0) - (a.msg_count || 0)).slice(0, 8)
  return (
    <div className="home">
      <header className="home-head">
        <div>
          <div className="home-eyebrow">信息源</div>
          <h1>从聊天里找回值得留下的信息</h1>
          <p className="hm-tag">选择一个 QQ / TIM 会话，查看原始消息、专题和图片。后续 Agent 会把其中值得保存的链接与知识自动送进收集箱。</p>
        </div>
        <button className="btn-accent" onClick={onConfig}>配置 / 导入</button>
      </header>

      {sessions.length === 0 ? (
        <section className="home-empty glass-card">
          <div className="home-empty-mark">Q</div>
          <h2>导入你的第一个信息源</h2>
          <p>聊天记录只作为来源保存，AI 整理结果会在它之上独立沉淀。</p>
          <button className="btn-accent" onClick={onConfig}>配置并导入会话</button>
        </section>
      ) : (
        <>
          <div className="home-overview" aria-label="数据概览">
            <span><b>{sessions.length}</b> 个会话</span>
            <span><b>{fmtCount(total)}</b> 条消息</span>
            <span><b>{fmtCount(totalAnalyzed)}</b> 条已分析</span>
          </div>
          <section className="home-sources">
            <div className="home-section-head">
              <div>
                <h2>最近的信息源</h2>
                <p>现有功能全部保留：概览、原始消息、专题和图库。</p>
              </div>
            </div>
            <div className="hm-cards">
              {top.map((s) => {
                const pct = s.msg_count ? Math.round((s.analyzed_count || 0) / s.msg_count * 100) : 0
                return (
                  <button key={s.id} className="hm-card glass-card" onClick={() => onPick(s)}>
                    <span className={`hm-card-avatar ${s.kind === 'group' ? 'group' : ''}`}>
                      {s.kind === 'group' ? '群' : (s.name || '?').slice(0, 1)}
                    </span>
                    <span className="hm-card-body">
                      <span className="hm-lbl">{s.name || s.peer_id}</span>
                      <span className="hm-act">{s.kind === 'group' ? '群聊' : '私聊'} · {fmtCount(s.msg_count)} 条消息</span>
                    </span>
                    <span className="hm-progress">{pct}%</span>
                    <span className="hm-arrow">→</span>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
