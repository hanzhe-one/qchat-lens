import { useMemo, useState } from 'react'

const INITIAL_ITEMS = [
  {
    id: 1, title: 'Aurora 公益 API', domain: 'aurora-api.example.com', url: 'https://aurora-api.example.com', category: '公益站',
    summary: '提供多个主流模型的公益 API，每日赠送少量额度，需要邀请码注册。群友反馈晚高峰偶尔限流。',
    tags: ['免费额度', '多模型', '需邀请'], status: '待验证', confidence: 92, source: 'AI 工具交流群', sender: '张三', time: '昨天 21:34',
    quote: '这个公益站最近还能用，每天会送一点额度，不过晚上有时候会限流。', note: 'Agent 识别到网址、免费额度和稳定性评价，建议归入「公益站」。',
  },
  {
    id: 2, title: 'Cloud Relay 中转服务', domain: 'relay.example.net', url: 'https://relay.example.net', category: '中转站',
    summary: '按量计费的 API 中转服务，支持 OpenAI 兼容接口。价格信息不完整，尚未发现明确运营主体。',
    tags: ['按量计费', 'OpenAI 兼容', '信息不完整'], status: '信息不完整', confidence: 78, source: '开发者交流群', sender: '林舟', time: '周三 10:12',
    quote: '临时用可以看看这个，接口兼容 OpenAI，价格你自己再确认下。', note: '缺少价格与运营主体信息，收录前建议人工确认。',
  },
  {
    id: 3, title: '公益站导航合集', domain: 'nav.example.org', url: 'https://nav.example.org', category: '导航合集',
    summary: '收录公益站、镜像站和中转服务的导航页面，站点较多，但未标注最近检查时间。',
    tags: ['站点合集', '待检查'], status: '待验证', confidence: 86, source: '羊毛与工具群', sender: '小北', time: '9 月 9 日',
    quote: '我之前都是从这个导航里找公益站的，你有空可以整理一下。', note: '可能一次引入大量链接，建议作为集合保存并单独执行可用性检查。',
  },
  {
    id: 4, title: 'Prompt Shelf', domain: 'prompts.example.dev', url: 'https://prompts.example.dev', category: 'AI 工具',
    summary: '开源提示词收藏与版本管理工具，支持本地部署和 Markdown 导出。', tags: ['开源', '提示词', '本地部署'],
    status: '可收录', confidence: 96, source: '独立开发交流群', sender: '陈默', time: '9 月 8 日',
    quote: '这个项目的分类交互不错，你做知识库也许能参考。', note: '类型和用途明确，置信度较高，可直接收录。',
  },
  {
    id: 5, title: '本地知识库检索实践', domain: 'blog.example.cn', url: 'https://blog.example.cn/local-search', category: '技术文章',
    summary: '介绍 SQLite FTS 与向量检索组合方案，包含索引更新、中文分词和结果排序示例。', tags: ['SQLite', '全文检索', '向量搜索'],
    status: '可收录', confidence: 94, source: '私聊 · 王工', sender: '王工', time: '9 月 7 日',
    quote: '你做本地知识库的话，这篇里面 FTS 和向量混排的思路可以看。', note: '与当前项目高度相关，建议归入「技术文章 / 检索」。',
  },
  {
    id: 6, title: '疑似重复的 API 站点', domain: 'api-mirror.example.com', url: 'https://api-mirror.example.com', category: '中转站',
    summary: '站点描述与已保存的 Cloud Relay 高度相似，可能只是更换域名或镜像入口。', tags: ['可能重复', '镜像'],
    status: '可能重复', confidence: 69, source: 'AI 工具交流群', sender: '阿远', time: '9 月 6 日',
    quote: '再丢一个备用地址，应该和上次那个是一家的。', note: 'Agent 检测到相似描述，建议与已有条目合并来源，而不是创建新知识。',
  },
]

const FILTERS = ['全部', '公益站', '中转站', 'AI 工具', '待确认']

function matchesFilter(item, filter) {
  if (filter === '全部') return true
  if (filter === '待确认') return ['待验证', '信息不完整', '可能重复'].includes(item.status)
  return item.category === filter
}

export default function InboxView() {
  const [items, setItems] = useState(INITIAL_ITEMS)
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(INITIAL_ITEMS[0].id)
  const [checked, setChecked] = useState([])
  const [notice, setNotice] = useState('')

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const haystack = [item.title, item.domain, item.category, item.summary, ...item.tags].join(' ').toLowerCase()
      return matchesFilter(item, filter) && (!needle || haystack.includes(needle))
    })
  }, [items, filter, query])

  const selected = selectedId ? items.find((item) => item.id === selectedId) || null : null
  const removeItems = (ids, message) => {
    setItems((current) => current.filter((item) => !ids.includes(item.id)))
    setChecked((current) => current.filter((id) => !ids.includes(id)))
    if (ids.includes(selectedId)) setSelectedId(0)
    setNotice(message)
  }
  const toggleChecked = (id) => setChecked((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])
  const markLater = (id) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: '稍后处理' } : item))
    setNotice('已放入稍后处理')
  }

  return (
    <section className="inbox-view">
      <header className="inbox-head">
        <div><div className="home-eyebrow">Agent 收集箱</div><h1>先替你收好，等有空再整理</h1><p>以下内容由 Agent 从聊天上下文中识别。确认后才会进入正式知识库。</p></div>
        <div className="inbox-head-count"><b>{items.length}</b><span>待处理</span></div>
      </header>
      <div className="inbox-toolbar">
        <div className="inbox-filters" aria-label="收集箱筛选">{FILTERS.map((name) => <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name}</button>)}</div>
        <label className="inbox-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、域名或标签" /></label>
      </div>
      {notice && <div className="inbox-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>关闭</button></div>}
      {checked.length > 0 && <div className="inbox-bulk glass-card"><span>已选择 <b>{checked.length}</b> 条</span><button className="btn-accent btn-sm" onClick={() => removeItems(checked, `已将 ${checked.length} 条信息收录到知识库`)}>批量收录</button><button className="btn-ghost btn-sm" onClick={() => setChecked([])}>取消选择</button></div>}
      <div className={`inbox-workspace ${selected ? 'has-detail' : ''}`}>
        <div className="inbox-list">
          {visibleItems.length === 0 && <div className="inbox-empty glass-card"><b>{items.length ? '没有符合条件的信息' : '收集箱已经清空'}</b><span>{items.length ? '换个筛选条件或搜索词试试。' : '新的聊天信息被 Agent 识别后会出现在这里。'}</span></div>}
          {visibleItems.map((item) => (
            <article key={item.id} className={`inbox-card glass-card ${selected?.id === item.id ? 'selected' : ''}`}>
              <label className="inbox-check" title="选择"><input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggleChecked(item.id)} /></label>
              <div className="inbox-card-main">
                <div className="inbox-card-top"><button className="inbox-title" onClick={() => setSelectedId(item.id)}>{item.title}</button><span className="inbox-status">{item.status}</span></div>
                <a className="inbox-domain" href={item.url} target="_blank" rel="noreferrer">{item.domain}</a>
                <button className="inbox-summary" onClick={() => setSelectedId(item.id)}>{item.summary}</button>
                <div className="inbox-tags"><span className="inbox-category">{item.category}</span>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <div className="inbox-source-line"><span>{item.sender} · {item.source}</span><time>{item.time}</time></div>
                <div className="inbox-actions"><button className="btn-accent btn-sm" onClick={() => removeItems([item.id], `「${item.title}」已收录到知识库`)}>收录</button><button className="btn-ghost btn-sm" onClick={() => markLater(item.id)}>稍后</button><button className="btn-plain btn-sm" onClick={() => removeItems([item.id], `已忽略「${item.title}」`)}>忽略</button><button className="inbox-source-action" onClick={() => setSelectedId(item.id)}>查看来源 →</button></div>
              </div>
            </article>
          ))}
        </div>
        {selected && (
          <aside className="inbox-detail glass-card">
            <div className="inbox-detail-head"><span>整理预览</span><button className="btn-icon" onClick={() => setSelectedId(0)} aria-label="关闭详情">×</button></div>
            <div className="inbox-detail-scroll">
              <div className="inbox-detail-title"><span className="inbox-category">{selected.category}</span><h2>{selected.title}</h2><a href={selected.url} target="_blank" rel="noreferrer">{selected.domain} ↗</a></div>
              <section className="inbox-detail-section"><h3>AI 摘要</h3><p>{selected.summary}</p><div className="agent-note"><span>✦</span><p>{selected.note}</p></div></section>
              <section className="inbox-detail-section"><h3>结构化信息</h3><dl className="inbox-fields"><div><dt>分类</dt><dd>{selected.category}</dd></div><div><dt>状态</dt><dd>{selected.status}</dd></div><div><dt>识别置信度</dt><dd>{selected.confidence}%</dd></div><div><dt>标签</dt><dd>{selected.tags.join(' · ')}</dd></div></dl></section>
              <section className="inbox-detail-section"><h3>原始聊天</h3><div className="source-quote"><div><b>{selected.sender}</b><time>{selected.time}</time></div><p>{selected.quote}</p></div><button className="btn-ghost btn-sm detail-source-button" onClick={() => setNotice('原型阶段：接入真实消息 ID 后，将在这里跳转并高亮原始消息')}>在原始会话中定位</button></section>
            </div>
            <div className="inbox-detail-actions"><button className="btn-accent" onClick={() => removeItems([selected.id], `「${selected.title}」已收录到知识库`)}>确认收录</button><button className="btn-ghost" onClick={() => markLater(selected.id)}>稍后处理</button></div>
          </aside>
        )}
      </div>
    </section>
  )
}
