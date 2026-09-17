import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, patch, post, fmtTs } from '../api'

const FILTERS = ['全部', '公益站', '中转站', 'AI 工具', '技术文章', '其他链接']

const STATUSES = [
  { id: '', name: '全部状态' },
  { id: 'unread', name: '未读' },
  { id: 'read', name: '已读' },
  { id: 'used', name: '已用' },
  { id: 'starred', name: '收藏' },
  { id: 'expired', name: '失效' },
]

const STATUS_LABEL = {
  unread: '未读',
  read: '已读',
  used: '已用',
  starred: '收藏',
  expired: '失效',
}

const STATUS_OPTIONS = STATUSES.filter((s) => s.id)

export default function KnowledgeView({ onOpenSource, onCountChange }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('全部')
  const [statusFilter, setStatusFilter] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(0)
  const [checked, setChecked] = useState([])
  const [sources, setSources] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [categoryDraft, setCategoryDraft] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', category: '', summary: '', tags: '', status: 'unread' })
  const autoPicked = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await get('/api/knowledge')
      setItems(d.items || [])
      if (onCountChange) onCountChange(d.count || 0)
    } catch (e) {
      setError(e.message || '加载全部知识失败')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (autoPicked.current || selectedId || items.length === 0) return
    autoPicked.current = true
    setSelectedId(items[0].id)
  }, [items, selectedId])

  const selected = selectedId ? items.find((item) => item.id === selectedId) || null : null

  const categories = useMemo(() => {
    const set = new Set(FILTERS.filter((f) => f !== '全部'))
    items.forEach((item) => { if (item.category) set.add(item.category) })
    return [...set]
  }, [items])

  const statusCounts = useMemo(() => {
    const map = { '': items.length }
    items.forEach((item) => {
      map[item.status] = (map[item.status] || 0) + 1
    })
    return map
  }, [items])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchedFilter = filter === '全部' || item.category === filter
      if (!matchedFilter) return false
      if (statusFilter && item.status !== statusFilter) return false
      if (!needle) return true
      const haystack = [item.title, item.domain, item.summary, item.category, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [items, filter, statusFilter, query])

  useEffect(() => {
    if (!selectedId) {
      setSources([])
      return
    }
    let cancelled = false
    const loadDetail = async () => {
      setDetailLoading(true)
      try {
        const d = await get(`/api/knowledge/${selectedId}`)
        if (!cancelled) setSources(d.sources || [])
      } catch (e) {
        if (!cancelled) {
          setSources([])
          setError(e.message || '加载知识详情失败')
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    loadDetail()
    return () => { cancelled = true }
  }, [selectedId])

  useEffect(() => { setEditing(false) }, [selectedId])

  const toggleChecked = (id) => setChecked((current) => (
    current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  ))

  const clearChecked = () => setChecked([])

  const bulkStatus = async (status) => {
    if (!checked.length) return
    setBusy(true)
    setError('')
    try {
      await post('/api/knowledge/bulk/status', { ids: checked, status })
      setItems((prev) => prev.map((item) => (
        checked.includes(item.id) ? { ...item, status } : item
      )))
      setNotice(`已将 ${checked.length} 条标记为「${STATUS_LABEL[status]}」`)
      clearChecked()
    } catch (e) {
      setError(e.message || '批量更新状态失败')
    } finally {
      setBusy(false)
    }
  }

  const bulkCategory = async () => {
    if (!checked.length) return
    const value = (categoryDraft || '').trim()
    if (!value) return
    setBusy(true)
    setError('')
    try {
      await post('/api/knowledge/bulk/category', { ids: checked, category: value })
      setItems((prev) => prev.map((item) => (
        checked.includes(item.id) ? { ...item, category: value } : item
      )))
      setNotice(`已将 ${checked.length} 条归入「${value}」`)
      setCategoryDraft(null)
      clearChecked()
    } catch (e) {
      setError(e.message || '批量改分类失败')
    } finally {
      setBusy(false)
    }
  }

  const bulkDelete = async () => {
    if (!checked.length) return
    setBusy(true)
    setError('')
    try {
      await post('/api/knowledge/bulk/delete', { ids: checked })
      const removed = checked
      setItems((prev) => prev.filter((item) => !removed.includes(item.id)))
      if (removed.includes(selectedId)) setSelectedId(0)
      if (onCountChange) onCountChange(Math.max(0, items.length - removed.length))
      setNotice(`已移除 ${removed.length} 条知识`)
      setConfirmDelete(false)
      clearChecked()
    } catch (e) {
      setError(e.message || '批量移除失败')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = () => {
    if (!selected) return
    setForm({
      title: selected.title || '',
      category: selected.category || '',
      summary: selected.summary || '',
      tags: (selected.tags || []).join(', '),
      status: selected.status || 'unread',
    })
    setEditing(true)
    setNotice('')
  }

  const saveEdit = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const tags = form.tags.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)
      const d = await patch(`/api/knowledge/${selected.id}`, {
        title: form.title,
        category: form.category,
        summary: form.summary,
        tags,
        status: form.status,
      })
      const updated = d.item
      setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setEditing(false)
      setNotice('已保存修改')
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const quickStatus = async (status) => {
    if (!selected) return
    try {
      const d = await patch(`/api/knowledge/${selected.id}`, { status })
      const updated = d.item
      setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setNotice(`已标记为「${STATUS_LABEL[status]}」`)
    } catch (e) {
      setError(e.message || '更新状态失败')
    }
  }

  const exportKnowledge = (format) => {
    const scope = checked.length ? `ids=${checked.join(',')}` : ''
    const url = `/api/knowledge/export?format=${format}${scope ? '&' + scope : ''}`
    const link = document.createElement('a')
    link.href = url
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setNotice(`已开始导出 ${checked.length ? checked.length + ' 条' : '全部'}知识（${format === 'md' ? 'Markdown' : 'JSON'}）`)
  }

  return (
    <section className="knowledge-view">
      <header className="inbox-head">
        <div>
          <div className="home-eyebrow">全部知识</div>
          <h1>把值得留下的信息，变成可回溯的知识</h1>
          <p>这里展示已经从收集箱确认收录的信息，可以按分类查找，也可以随时回到原始聊天上下文。</p>
        </div>
        <div className="inbox-head-count">
          <b>{items.length}</b>
          <span>条知识</span>
        </div>
      </header>

      <div className="inbox-toolbar">
        <div className="inbox-filters">
          {FILTERS.map((item) => (
            <button
              key={item}
              className={filter === item ? 'active' : ''}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="inbox-tools">
          <label className="inbox-search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题、域名、标签"
            />
          </label>
          <button className="btn-ghost btn-sm" onClick={() => exportKnowledge('md')}>导出 MD</button>
          <button className="btn-ghost btn-sm" onClick={() => exportKnowledge('json')}>导出 JSON</button>
        </div>
      </div>

      <div className="inbox-toolbar knowledge-status-bar">
        <div className="inbox-filters">
          {STATUSES.map((item) => (
            <button
              key={item.id || 'all'}
              className={statusFilter === item.id ? 'active' : ''}
              onClick={() => setStatusFilter(item.id)}
            >
              {item.name}
              <em>{statusCounts[item.id] || 0}</em>
            </button>
          ))}
        </div>
        <button className="btn-ghost btn-sm knowledge-select-all" onClick={() => {
          const ids = visibleItems.map((item) => item.id)
          const allChecked = ids.length > 0 && ids.every((id) => checked.includes(id))
          setChecked(allChecked ? checked.filter((id) => !ids.includes(id)) : [...new Set([...checked, ...ids])])
        }}>
          {visibleItems.length > 0 && visibleItems.every((item) => checked.includes(item.id)) ? '取消全选' : '全选'}
        </button>
      </div>

      {error && (
        <div className="inbox-notice is-error" role="status">
          <span>{error}</span>
          <button onClick={() => setError('')}>关闭</button>
        </div>
      )}
      {notice && (
        <div className="inbox-notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')}>关闭</button>
        </div>
      )}

      {checked.length > 0 && (
        <div className="inbox-bulk glass-card">
          <span>已选择 <b>{checked.length}</b> 条</span>
          {confirmDelete ? (
            <>
              <span className="bulk-warn">移除后原始聊天记录保留，仅取消收录。</span>
              <button className="btn-plain btn-sm" onClick={bulkDelete} disabled={busy}>确认移除</button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(false)} disabled={busy}>取消</button>
            </>
          ) : categoryDraft !== null ? (
            <>
              <input
                className="bulk-input"
                autoFocus
                list="knowledge-categories-bulk"
                value={categoryDraft}
                onChange={(e) => setCategoryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') bulkCategory()
                  if (e.key === 'Escape') setCategoryDraft(null)
                }}
                placeholder="输入新的分类名"
              />
              <datalist id="knowledge-categories-bulk">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              <button className="btn-accent btn-sm" onClick={bulkCategory} disabled={busy || !categoryDraft.trim()}>确定</button>
              <button className="btn-ghost btn-sm" onClick={() => setCategoryDraft(null)} disabled={busy}>取消</button>
            </>
          ) : (
            <>
              <button className="btn-ghost btn-sm" onClick={() => bulkStatus('starred')} disabled={busy}>标记收藏</button>
              <button className="btn-ghost btn-sm" onClick={() => bulkStatus('read')} disabled={busy}>标记已读</button>
              <button className="btn-ghost btn-sm" onClick={() => setCategoryDraft(selected?.category || '')} disabled={busy}>改分类</button>
              <button className="btn-plain btn-sm" onClick={() => setConfirmDelete(true)} disabled={busy}>移除</button>
              <button className="btn-ghost btn-sm" onClick={clearChecked} disabled={busy}>取消选择</button>
            </>
          )}
        </div>
      )}

      <div className={`inbox-workspace ${selected ? 'has-detail' : ''}`}>
        <div className="inbox-list">
          {loading && <div className="inbox-empty">正在加载全部知识…</div>}
          {!loading && visibleItems.length === 0 && (
            <div className="inbox-empty">
              <b>{items.length ? '没有符合条件的知识' : '还没有收录任何知识'}</b>
              <span>{items.length ? '换个分类、状态或搜索词试试。' : '先去收集箱确认一条信息，它就会出现在这里。'}</span>
            </div>
          )}
          {!loading && visibleItems.map((item) => (
            <article
              key={item.id}
              className={`inbox-card glass-card ${selected?.id === item.id ? 'selected' : ''} ${checked.includes(item.id) ? 'is-checked' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              <label className="inbox-check" title="选择" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggleChecked(item.id)} />
              </label>
              <div className="inbox-card-main">
                <div className="inbox-card-top">
                  <button className="inbox-title" onClick={(e) => { e.stopPropagation(); setSelectedId(item.id) }}>
                    {item.title || item.domain}
                  </button>
                  <span className={`inbox-status status-${item.status || 'unread'}`}>
                    {STATUS_LABEL[item.status] || '未读'}
                  </span>
                </div>
                <a
                  className="inbox-domain"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.domain || item.url}
                </a>
                <button
                  className="inbox-summary"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(item.id) }}
                >
                  {item.summary || '暂无摘要'}
                </button>
                <div className="inbox-tags">
                  <span className="inbox-category">{item.category}</span>
                  {(item.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="inbox-source-line">
                  <span>收录于 {fmtTs(item.created_at)}</span>
                  <time>{item.source_count || 0} 条来源</time>
                </div>
              </div>
            </article>
          ))}
        </div>

        {selected && (
          <>
            <div className="inbox-detail-backdrop" onClick={() => setSelectedId(0)} aria-hidden="true" />
            <aside className="inbox-detail glass-card">
              <div className="inbox-detail-head">
                <span>{editing ? '编辑知识' : '知识详情'}</span>
                <div className="inbox-detail-head-actions">
                  {!editing && (
                    <button className="btn-ghost btn-sm" onClick={startEdit}>编辑</button>
                  )}
                  <button className="btn-icon" onClick={() => setSelectedId(0)} aria-label="关闭详情">×</button>
                </div>
              </div>
              <div className="inbox-detail-scroll">
                {editing ? (
                  <div className="knowledge-form">
                    <label className="knowledge-field">
                      <span>标题</span>
                      <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="给这条知识起个名字"
                      />
                    </label>
                    <label className="knowledge-field">
                      <span>分类</span>
                      <input
                        list="knowledge-categories"
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        placeholder="例如：公益站"
                      />
                      <datalist id="knowledge-categories">
                        {categories.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </label>
                    <label className="knowledge-field">
                      <span>标签</span>
                      <input
                        value={form.tags}
                        onChange={(e) => setForm({ ...form, tags: e.target.value })}
                        placeholder="用逗号或空格分隔"
                      />
                    </label>
                    <label className="knowledge-field">
                      <span>状态</span>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="knowledge-field">
                      <span>摘要</span>
                      <textarea
                        rows={5}
                        value={form.summary}
                        onChange={(e) => setForm({ ...form, summary: e.target.value })}
                        placeholder="补充这条知识的用途或要点"
                      />
                    </label>
                    <div className="knowledge-form-actions">
                      <button className="btn-accent btn-sm" onClick={saveEdit} disabled={saving}>
                        {saving ? '保存中…' : '保存'}
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="inbox-detail-title">
                      <span className={`inbox-status status-${selected.status || 'unread'}`}>
                        {STATUS_LABEL[selected.status] || '未读'}
                      </span>
                      <h2>{selected.title || selected.domain}</h2>
                      <a href={selected.url} target="_blank" rel="noreferrer">
                        {selected.domain || selected.url} ↗
                      </a>
                    </div>

                    <div className="knowledge-quick-status">
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s.id}
                          className={`btn-ghost btn-sm ${selected.status === s.id ? 'on' : ''}`}
                          onClick={() => quickStatus(s.id)}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>

                    <section className="inbox-detail-section">
                      <h3>摘要</h3>
                      <p>{selected.summary || '暂无摘要'}</p>
                    </section>
                    <section className="inbox-detail-section">
                      <h3>结构化信息</h3>
                      <dl className="inbox-fields">
                        <div><dt>分类</dt><dd>{selected.category}</dd></div>
                        <div><dt>标签</dt><dd>{(selected.tags || []).join(' · ') || '暂无'}</dd></div>
                        <div><dt>状态</dt><dd>{STATUS_LABEL[selected.status] || '未读'}</dd></div>
                        <div><dt>来源次数</dt><dd>{selected.source_count || 0} 次</dd></div>
                        <div><dt>收录时间</dt><dd>{fmtTs(selected.created_at)}</dd></div>
                      </dl>
                    </section>
                    <section className="inbox-detail-section">
                      <h3>来源记录</h3>
                      {detailLoading && <p className="knowledge-source-loading">正在加载来源…</p>}
                      {!detailLoading && sources.length === 0 && <p>暂无来源记录</p>}
                      {!detailLoading && sources.map((source) => (
                        <div key={source.id} className="source-quote knowledge-source">
                          <div>
                            <b>{source.sender_name || '未知发送者'}</b>
                            <time>{fmtTs(source.ts)}</time>
                          </div>
                          <p>{source.quote}</p>
                          <button
                            className="btn-ghost btn-sm detail-source-button"
                            onClick={() => onOpenSource?.({ ...source, domain: selected.domain || selected.url })}
                          >
                            查看来源 →
                          </button>
                        </div>
                      ))}
                    </section>
                  </>
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </section>
  )
}
