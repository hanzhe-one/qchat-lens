import { useEffect, useState } from 'react'
import { get, post } from '../api'

export default function ConfigPanel({ onClose }) {
  const [cfg, setCfg] = useState({ base_url: '', api_key: '', model: '' })
  const [friends, setFriends] = useState([])
  const [targetUid, setTargetUid] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('llm')

  useEffect(() => {
    get('/api/config').then((d) => setCfg(d.config)).catch(() => {})
    get('/api/qce/friends').then((d) => {
      if (d.friends && d.friends.length) {
        setFriends(d.friends)
        setTargetUid(d.friends[0].uid)
      }
    }).catch(() => {})
  }, [])

  const saveLlm = async () => {
    setBusy('saving')
    try {
      await post('/api/config', { base_url: cfg.base_url, api_key: cfg.api_key, model: cfg.model })
      setMsg('✓ LLM 配置已保存')
    } catch (e) { setMsg('保存失败: ' + e.message) }
    setBusy('')
  }

  const testLlm = async () => {
    setBusy('test')
    try { const d = await post('/api/config/test', {}); setMsg(d.ok ? '✓ 连接成功' : '✕ ' + d.error) }
    catch (e) { setMsg('测试异常: ' + e.message) }
    setBusy('')
  }

  const importQce = async () => {
    if (!targetUid) { setMsg('请先选择好友'); return }
    setBusy('imp'); setMsg('正在从 QQ 云端同步并导入…（历史较长时需几分钟）')
    try {
      const d = await post('/api/import/qce', { peer_uid: targetUid })
      setMsg(`✓ 导入完成：新增 ${d.result.added} 条入库`)
    } catch (e) { setMsg('✕ 导入失败: ' + e.message) }
    setBusy('')
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>配置与导入</b>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-tabs">
          <button className={tab === 'llm' ? 'on' : ''} onClick={() => setTab('llm')}>LLM</button>
          <button className={tab === 'import' ? 'on' : ''} onClick={() => setTab('import')}>导入数据</button>
        </div>

        {tab === 'llm' && (
          <div className="modal-body">
            <p className="hint">任意 OpenAI 兼容接口：DeepSeek / MiniMax / 智谱 / Kimi / Ollama。LLM 仅用于分析（打标签、归纳专题），原文永不外传。</p>
            <label>API 地址<input value={cfg.base_url} placeholder="https://api.deepseek.com/v1"
              onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} /></label>
            <label>API Key<input type="password" value={cfg.api_key} placeholder="sk-…"
              onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} /></label>
            <label>模型<input value={cfg.model} placeholder="deepseek-chat"
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })} /></label>
            <div className="modal-actions">
              <button className="btn-accent" onClick={saveLlm} disabled={busy === 'saving'}>保存</button>
              <button className="btn-ghost" onClick={testLlm} disabled={busy === 'test'}>测试连接</button>
            </div>
          </div>
        )}

        {tab === 'import' && (
          <div className="modal-body">
            <p className="hint">从 QQ 导出工具（QCE）拉取云端完整历史，入库后原文永久保留在本机数据库。</p>
            <p className="hint warn">要求本机运行 QQ + NapCat + QCE（QCE 端口 40653）。老 TIM 的历史会随 QQ 云同步一并拉取。</p>
            <label>选择好友/会话
              <select value={targetUid} onChange={(e) => setTargetUid(e.target.value)}>
                {friends.length === 0 && <option value="">未获取到列表（QCE 未运行？）</option>}
                {friends.map((f) => <option key={f.uid} value={f.uid}>{f.name} ({f.uin})</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button className="btn-accent" onClick={importQce} disabled={busy === 'imp'}>
                {busy === 'imp' ? '同步中…' : '同步并导入完整历史'}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 14 }}>导入完成后回到主界面，进入该会话点「分析 / 重建专题」开始 AI 分类。</div>
          </div>
        )}
        {msg && <div className="msg-line">{msg}</div>}
      </div>
    </div>
  )
}
