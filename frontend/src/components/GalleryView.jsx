import { useEffect, useRef, useState } from 'react'
import { get, fmtTsDate } from '../api'

export default function GalleryView({ session }) {
  const [imgs, setImgs] = useState([])
  const [lightbox, setLightbox] = useState(null)
  const loadingRef = useRef(false)
  const [hasMore, setHasMore] = useState(true)

  const load = async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    const afterTs = imgs.length ? imgs[imgs.length - 1].ts : 0
    try {
      const d = await get(`/api/sessions/${session.id}/gallery?kind=image&after_ts=${afterTs}&limit=120`)
      if (afterTs === 0) setImgs(d.resources)
      else setImgs((p) => [...p, ...d.resources])
      if (d.resources.length < 120) setHasMore(false)
    } catch (e) {}
    loadingRef.current = false
  }

  useEffect(() => { load() }, [session.id])

  return (
    <div className="gallery">
      <div className="gallery-grid">
        {imgs.length === 0 && <div className="gallery-empty">这个会话还没有图片。<br /><span style={{ fontSize: 12, color: 'var(--faint)' }}>如果消息含图片但这里为空，可在配置里重新导入一次以同步资源。</span></div>}
        {imgs.map((r) => (
          <div key={r.id} className="g-item" onClick={() => setLightbox(r)}>
            <img loading="lazy" src={`/api/resource?path=${encodeURIComponent(r.path)}`}
                 alt={r.name}
                 style={r.width && r.height ? { aspectRatio: `${r.width}/${r.height}` } : {}} />
            <div className="g-cap">
              <span>{fmtTsDate(r.ts)}</span>
              <span className="mono" style={{ color: 'var(--faint)', fontSize: 10 }}>#{r.message_id}</span>
            </div>
          </div>
        ))}
      </div>
      {hasMore && <div className="load-more"><button className="btn-ghost btn-sm" onClick={load}>加载更多</button></div>}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={`/api/resource?path=${encodeURIComponent(lightbox.path)}`} alt={lightbox.name} />
          <div className="lb-cap">{lightbox.name}</div>
        </div>
      )}
    </div>
  )
}
