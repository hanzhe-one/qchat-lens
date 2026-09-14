import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, fmtTs } from '../api'

const FILTERS = ['全部', '公益站', '中转站', 'AI 工具', '技术文章', '其他链接']

export default function KnowledgeView({ onOpenSource, onCountChange }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(0)
  const [sources, setSources] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    if (!selectedId && items.length > 0) setSelectedId(items[0].id)
  }, [items, selectedId])

  const selected = selectedId ? items.find((item) => item.id === selectedId) || null : null

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchedFilter = filter === '全部' || item.category === filter
      if (!matchedFilter) return false
      if (!needle) return true
      const haystack = [item.title, item.domain, item.summary, item.category, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [items, filter, query])

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
        <label className="inbox-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、域名、标签"
          />
        </label>
      </div>

      {error && <div className="inbox-notice is-error">{error}</div>}

      <div className="inbox-workspace">
        <div className="inbox-list">
          {loading && <div className="inbox-empty">正在加载全部知识…</div>}
          {!loading && visibleItems.length === 0 && (
            <div className="inbox-empty">
              <b>{items.length ? '没有符合条件的知识' : '还没有收录任何知识'}</b>
              <span>{items.length ? '换个分类或搜索词试试。' : '先去收集箱确认一条信息，它就会出现在这里。'}</span>
            </div>
          )}
          {!loading && visibleItems.map((item) => (
            <article
              key={item.id}
              className={`inbox-card glass-card ${selected?.id === item.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="inbox-card-main">
                <div className="inbox-card-top">
                  <button className="inbox-title" onClick={(e) => { e.stopPropagation(); setSelectedId(item.id) }}>
                    {item.title || item.domain}
                  </button>
                  <span className="inbox-status">{item.source_count || 0} 次来源</span>
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
          <aside className="inbox-detail glass-card">
            <div className="inbox-detail-head">
              <span>知识详情</span>
              <button className="btn-icon" onClick={() => setSelectedId(0)} aria-label="关闭详情">×</button>
            </div>
            <div className="inbox-detail-scroll">
              <div className="inbox-detail-title">
                <span className="inbox-category">{selected.category}</span>
                <h2>{selected.title || selected.domain}</h2>
                <a href={selected.url} target="_blank" rel="noreferrer">
                  {selected.domain || selected.url} ↗
                </a>
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
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}
