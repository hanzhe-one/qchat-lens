import { useEffect, useState, useCallback } from 'react'
import './App.css'
import { get, post } from './api'
import Sidebar from './components/Sidebar'
import TimelineView from './components/TimelineView'
import TopicView from './components/TopicView'
import OverviewView from './components/OverviewView'
import ConfigPanel from './components/ConfigPanel'

export default function App() {
  const [sessions, setSessions] = useState([])
  const [current, setCurrent] = useState(null)
  const [view, setView] = useState('overview') // overview | timeline | topics
  const [stats, setStats] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const d = await get('/api/sessions')
      setSessions(d.sessions)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const pickSession = async (s) => {
    setCurrent(s)
    setView('overview')
  }

  return (
    <div className="app">
      <Sidebar sessions={sessions}
               current={current}
               onPick={pickSession}
               onConfig={() => setConfigOpen(true)} />
      <main className="main">
        {!current ? (
          <OverviewView sessions={sessions} onPick={pickSession} />
        ) : (
          <>
            <div className="topbar">
              <div className="crumb">
                <button className="crumb-link" onClick={() => setCurrent(null)}>所有会话</button>
                <span className="crumb-sep">/</span>
                <b>{current.name || current.peer_id}</b>
                <span className="crumb-meta">
                  {current.msg_count} 条 · {current.kind === 'group' ? '群聊' : '私聊'}
                </span>
              </div>
              <div className="seg">
                <button className={view === 'overview' ? 'on' : ''} onClick={() => setView('overview')}>概览</button>
                <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>消息</button>
                <button className={view === 'topics' ? 'on' : ''} onClick={() => setView('topics')}>专题</button>
              </div>
            </div>
            {view === 'overview' && <OverviewView sessions={sessions} current={current} onPick={pickSession} onGoto={setView} session={current} />}
            {view === 'timeline' && <TimelineView session={current} />}
            {view === 'topics' && <TopicView session={current} />}
          </>
        )}
      </main>
      {configOpen && <ConfigPanel onClose={() => setConfigOpen(false)} />}
    </div>
  )
}
