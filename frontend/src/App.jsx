import { useEffect, useState, useCallback } from 'react'
import './App.css'
import { get, fmtCount } from './api'
import Sidebar from './components/Sidebar'
import DashView from './components/DashView'
import TimelineView from './components/TimelineView'
import TopicView from './components/TopicView'
import GalleryView from './components/GalleryView'
import HomeView from './components/HomeView'
import ConfigPanel from './components/ConfigPanel'

export default function App() {
  const [sessions, setSessions] = useState([])
  const [current, setCurrent] = useState(null)
  const [view, setView] = useState('dash') // dash | timeline | topics | gallery
  const [configOpen, setConfigOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const d = await get('/api/sessions')
      setSessions(d.sessions)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const total = sessions.reduce((a, s) => a + (s.msg_count || 0), 0)
  const totalAnalyzed = sessions.reduce((a, s) => a + (s.analyzed_count || 0), 0)

  const pickSession = (s) => { setCurrent(s); setView('dash') }

  return (
    <div className="app">
      <Sidebar sessions={sessions} current={current}
               total={total} totalAnalyzed={totalAnalyzed}
               onPick={pickSession}
               onConfig={() => setConfigOpen(true)} />
      <main className="main">
        {!current ? (
          <HomeView sessions={sessions} total={total} totalAnalyzed={totalAnalyzed}
                    onPick={pickSession} onConfig={() => setConfigOpen(true)} />
        ) : (
          <>
            <div className="main-top">
              <div className="mt-left">
                <button className="btn-icon mt-back" title="返回所有会话"
                        onClick={() => setCurrent(null)}>←</button>
                <div>
                  <div className="mt-title">{current.name || current.peer_id}</div>
                  <div className="mt-meta">
                    {current.kind === 'group' ? '群聊' : '私聊'} · {fmtCount(current.msg_count)} 条 · {current.analyzed_count || 0} 已分析
                  </div>
                </div>
              </div>
              <div className="seg" style={{ marginLeft: 18 }}>
                <button className={view === 'dash' ? 'on' : ''} onClick={() => setView('dash')}>概览</button>
                <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>消息</button>
                <button className={view === 'topics' ? 'on' : ''} onClick={() => setView('topics')}>专题</button>
                <button className={view === 'gallery' ? 'on' : ''} onClick={() => setView('gallery')}>图库</button>
              </div>
              <div className="mt-right">
                <button className="btn-ghost btn-sm" onClick={() => setView('timeline')}>浏览消息</button>
                <button className="btn-accent btn-sm" onClick={() => setConfigOpen(true)}>配置 / 导入</button>
              </div>
            </div>
            <div className="main-body">
              {view === 'dash' && <DashView session={current} onGoto={setView} />}
              {view === 'timeline' && <TimelineView session={current} />}
              {view === 'topics' && <TopicView session={current} />}
              {view === 'gallery' && <GalleryView session={current} />}
            </div>
          </>
        )}
      </main>
      {configOpen && <ConfigPanel onClose={() => { setConfigOpen(false); refresh() }} />}
    </div>
  )
}
