import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, patch, fmtTs } from '../api'

// 分类按钮由实际数据动态生成，见下方 filters；这里只保留两个固定入口。
const BASE_FILTER = '全部'
const UNCERTAIN_FILTER = '待确认'

function statusLabel(item) {
  if (item.status === 'later') return '稍后处理'
  if (item.status === 'ignored') return '已忽略'
  if (item.status === 'accepted') return '已收录'
  if (item.category === '其他链接') return '待确认'
  return '待验证'
}

function matchesFilter(item, filter) {
  if (filter === BASE_FILTER) return true
  if (filter === UNCERTAIN_FILTER) return item.category === '其他链接' || item.confidence < 72
  return item.category === filter
}

export default function InboxView({ onOpenSource, onCountChange }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState(BASE_FILTER)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(0)
  const [checked, setChecked] = useState([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const scannedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await get('/api/inbox?status=active')
      setItems(d.items || [])
      if (onCountChange) onCountChange(d.count || 0)
    } catch (e) {
      setError(e.message || '加载收集箱失败')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  const scan = useCallback(async (silent = false) => {
    setScanning(true)
    setError('')
    try {
      await post('/api/inbox/scan', {})
      await load()
      if (!silent) setNotice('扫描完成，已更新收集箱')
    } catch (e) {
      setError(e.message || '扫描失败')
    } finally {
      setScanning(false)
    }
  }, [load])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!loading && !scannedRef.current && items.length === 0) {
      scannedRef.current = true
      scan(true)
    }
  }, [loading, items.length, scan])

  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id)
  }, [items, selectedId])

  // 分类按钮来自实际扫描结果，而不是预设清单——换一套分类配置即换一套按钮。
  const filters = useMemo(() => {
    const set = new Set()
    items.forEach((item) => { if (item.category) set.add(item.category) })
    return [BASE_FILTER, ...set, UNCERTAIN_FILTER]
  }, [items])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const haystack = [item.title, item.domain, item.category, item.summary, ...(item.tags || [])].join(' ').toLowerCase()
      return matchesFilter(item, filter) && (!needle || haystack.includes(needle))
    })
  }, [items, filter, query])

  const selected = selectedId ? items.find((item) => item.id === selectedId) || null : null

  const removeLocal = (ids) => {
    setItems((current) => current.filter((item) => !ids.includes(item.id)))
    setChecked((current) => current.filter((id) => !ids.includes(id)))
    if (ids.includes(selectedId)) setSelectedId(0)
  }

  const acceptItems = async (ids, message) => {
    if (!ids.length) return
    try {
      await post('/api/inbox/accept', { ids })
      removeLocal(ids)
      setNotice(message)
      if (onCountChange) onCountChange(Math.max(0, items.length - ids.length))
    } catch (e) {
      setError(e.message || '收录失败')
    }
  }

  const updateStatus = async (id, status, message) => {
    try {
      await patch(`/api/inbox/${id}`, { status })
      setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item))
      setNotice(message)
    } catch (e) {
      setError(e.message || '更新失败')
    }
  }

  const toggleChecked = (id) => setChecked((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])

  return (
    <section className="inbox-view">
      <header className="inbox-head">
        <div>
          <div className="home-eyebrow">Agent 收集箱</div>
          <h1>先替你收好，等有空再整理</h1>
          <p>Agent 会从聊天里的链接和上下文中识别候选信息，确认后进入正式知识库。</p>
        </div>
        <div className="inbox-head-count">
          <b>{items.length}</b>
          <span>待处理</span>
        </div>
      </header>

      <div className="inbox-toolbar">
        <div className="inbox-filters" aria-label="收集箱筛选">
          {filters.map((name) => (
            <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name}</button>
          ))}
        </div>
        <div className="inbox-tools">
          <label className="inbox-search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、域名或标签" />
          </label>
          <button className="btn-ghost btn-sm" onClick={() => scan()} disabled={scanning}>
            {scanning ? '扫描中…' : '扫描聊天记录'}
          </button>
        </div>
      </div>

      {(notice || error) && (
        <div className={`inbox-notice ${error ? 'is-error' : ''}`} role="status">
          <span>{error || notice}</span>
          <button onClick={() => { setNotice(''); setError('') }}>关闭</button>
        </div>
      )}

      {checked.length > 0 && (
        <div className="inbox-bulk glass-card">
          <span>已选择 <b>{checked.length}</b> 条</span>
          <button className="btn-accent btn-sm" onClick={() => acceptItems(checked, `已将 ${checked.length} 条信息收录到知识库`)}>批量收录</button>
          <button className="btn-ghost btn-sm" onClick={() => setChecked([])}>取消选择</button>
        </div>
      )}

      <div className={`inbox-workspace ${selected ? 'has-detail' : ''}`}>
        <div className="inbox-list">
          {loading && <div className="inbox-empty glass-card"><b>正在加载收集箱…</b><span>Agent 正在读取候选信息。</span></div>}
          {!loading && visibleItems.length === 0 && (
            <div className="inbox-empty glass-card">
              <b>{items.length ? '没有符合条件的信息' : '收集箱已经清空'}</b>
              <span>{items.length ? '换个筛选条件或搜索词试试。' : '点击右上角「扫描聊天记录」，Agent 会从消息里识别链接。'}</span>
            </div>
          )}
          {!loading && visibleItems.map((item) => (
            <article key={item.id} className={`inbox-card glass-card ${selected?.id === item.id ? 'selected' : ''}`}>
              <label className="inbox-check" title="选择">
                <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggleChecked(item.id)} />
              </label>
              <div className="inbox-card-main">
                <div className="inbox-card-top">
                  <button className="inbox-title" onClick={() => setSelectedId(item.id)}>{item.title || item.domain}</button>
                  <span className="inbox-status">{statusLabel(item)}</span>
                </div>
                <a className="inbox-domain" href={item.url} target="_blank" rel="noreferrer">{item.domain || item.url}</a>
                <button className="inbox-summary" onClick={() => setSelectedId(item.id)}>{item.summary}</button>
                <div className="inbox-tags">
                  <span className="inbox-category">{item.category}</span>
                  {(item.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="inbox-source-line">
                  <span>{item.sender_name || '未知发送者'} · {item.session_name || item.session_id}</span>
                  <time>{fmtTs(item.ts)}</time>
                </div>
                <div className="inbox-actions">
                  <button className="btn-accent btn-sm" onClick={() => acceptItems([item.id], `「${item.title || item.domain}」已收录到知识库`)}>收录</button>
                  <button className="btn-ghost btn-sm" onClick={() => updateStatus(item.id, 'later', '已放入稍后处理')}>稍后</button>
                  <button className="btn-plain btn-sm" onClick={() => updateStatus(item.id, 'ignored', `已忽略「${item.title || item.domain}」`)}>忽略</button>
                  <button className="inbox-source-action" onClick={() => onOpenSource?.(item)}>查看来源 →</button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {selected && (
          <aside className="inbox-detail glass-card">
            <div className="inbox-detail-head">
              <span>整理预览</span>
              <button className="btn-icon" onClick={() => setSelectedId(0)} aria-label="关闭详情">×</button>
            </div>
            <div className="inbox-detail-scroll">
              <div className="inbox-detail-title">
                <span className="inbox-category">{selected.category}</span>
                <h2>{selected.title || selected.domain}</h2>
                <a href={selected.url} target="_blank" rel="noreferrer">{selected.domain || selected.url} ↗</a>
              </div>
              <section className="inbox-detail-section">
                <h3>AI 摘要</h3>
                <p>{selected.summary}</p>
                <div className="agent-note"><span>✦</span><p>{selected.note}</p></div>
              </section>
              <section className="inbox-detail-section">
                <h3>结构化信息</h3>
                <dl className="inbox-fields">
                  <div><dt>分类</dt><dd>{selected.category}</dd></div>
                  <div><dt>状态</dt><dd>{statusLabel(selected)}</dd></div>
                  <div><dt>识别置信度</dt><dd>{selected.confidence}%</dd></div>
                  <div><dt>标签</dt><dd>{(selected.tags || []).join(' · ') || '暂无'}</dd></div>
                  <div><dt>出现次数</dt><dd>{selected.source_count || 1} 次</dd></div>
                </dl>
              </section>
              <section className="inbox-detail-section">
                <h3>原始聊天</h3>
                <div className="source-quote">
                  <div>
                    <b>{selected.sender_name || '未知发送者'}</b>
                    <time>{fmtTs(selected.ts)}</time>
                  </div>
                  <p>{selected.quote}</p>
                </div>
                <button className="btn-ghost btn-sm detail-source-button" onClick={() => onOpenSource?.(selected)}>
                  在原始会话中定位
                </button>
              </section>
            </div>
            <div className="inbox-detail-actions">
              <button className="btn-accent" onClick={() => acceptItems([selected.id], `「${selected.title || selected.domain}」已收录到知识库`)}>确认收录</button>
              <button className="btn-ghost" onClick={() => updateStatus(selected.id, 'later', '已放入稍后处理')}>稍后处理</button>
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}
