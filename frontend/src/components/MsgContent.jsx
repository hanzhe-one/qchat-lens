import { useState } from 'react'
import { resUrl, resDownload } from '../api'

// 把文本里的 URL 抽出来做成显眼可点的链接块
const URL_RE = /(https?:\/\/[^\s，。；！？、）】"']+)/g

export function splitLinks(text) {
  if (!text) return []
  return String(text).split(URL_RE).filter(Boolean)
}

export default function MsgContent({ text, resources, size = 'md' }) {
  const [zoom, setZoom] = useState(null)
  const res = resources || []
  const imgs = res.filter((r) => r.kind === 'image' && r.path)
  const files = res.filter((r) => r.kind !== 'image')
  // 有真实资源时，去掉文本里遗留的 [图片:x] / [文件:x] 占位，避免重复
  let cleanText = text || ''
  if (imgs.length) cleanText = cleanText.replace(/\[图片:[^\]]*\]/g, '')
  if (files.length) cleanText = cleanText.replace(/\[(?:文件|语音|视频):[^\]]*\]/g, '')

  return (
    <div className="mc">
      {cleanText && (
        <div className="mc-text" style={{ whiteSpace: 'pre-wrap' }}>
          {splitLinks(cleanText).map((p, i) =>
            /^https?:\/\//i.test(p) ? (
              <a key={i} className="mc-link" href={p} target="_blank" rel="noopener noreferrer">
                <span className="mc-link-ico">↗</span>{p}
              </a>
            ) : (
              <span key={i}>{p}</span>
            )
          )}
        </div>
      )}

      {imgs.length > 0 && (
        <div className="mc-imgs">
          {imgs.slice(0, size === 'md' ? 4 : 9).map((r) => (
            <div key={r.id} className="mc-img" onClick={() => setZoom(r)} title={r.name}>
              <img loading="lazy" src={resUrl(r)} alt={r.name} />
            </div>
          ))}
          {imgs.length > (size === 'md' ? 4 : 9) && <div className="mc-img more">+{imgs.length - (size === 'md' ? 4 : 9)}</div>}
        </div>
      )}

      {files.length > 0 && (
        <div className="mc-files">
          {files.map((r) => (
            <a key={r.id} className="mc-file" href={resDownload(r)} title="点击下载">
              <span className="mf-ico">⬇</span>
              <span className="mf-name">{r.name || '文件'}</span>
              <span className="mf-size mono">{fmtSize(r.size)}</span>
            </a>
          ))}
        </div>
      )}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={resUrl(zoom)} alt={zoom.name} />
          <div className="lb-cap">{zoom.name}</div>
        </div>
      )}
    </div>
  )
}

function fmtSize(b) {
  if (!b) return ''
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB'
  if (b > 1024) return (b / 1024).toFixed(0) + ' KB'
  return b + ' B'
}
