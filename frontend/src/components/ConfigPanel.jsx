import { useEffect, useState } from 'react'
import { get, post } from '../api'

export default function ConfigPanel({ onClose }) {
  const [cfg, setCfg] = useState({ base_url: '', api_key: '', model: '' })
  const [friends, setFriends] = useState([])
  const [targetUid, setTargetUid] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [llmOn, setLlmOn] = useState(false)
  const [tab, setTab] = useState('llm')

  useEffect(() => {
    get('/api/config').then((d) => { setCfg(d.config); setLlmOn(!!(d.config.base_url && d.config.model)) }).catch(() => {})
    get('/api/qce/friends').then((d) => { if (d.friends) { setFriends(d.friends); if (d.friends.length) setTargetUid(d.friends[0].uid) } }).catch(() => {})
  }, [])

  const saveLlm = async () => {
    setBusy('saving')
    try {
      await post('/api/config', { base_url: cfg.base_url, api_key: cfg.api_key, model: cfg.model })
      setLlmOn(true)
      setMsg('LLM 配置已保存')
    } catch (e) { setMsg('保存失败: ' + e.message) }
    setBusy('')
  }

  const testLlm = async () => {
    setBusy('testing')
    try {
      const d = await post('/api/config/test', {})
      setMsg(d.ok ? '连接成功 ✓' : '失败: ' + d.error)
    } catch (e) { setMsg('测试异常: ' + e.message) }
    setBusy('')
  }

  const importQce = async () => {
    if (!targetUid) { setMsg('先选择要导入的好友'); return }
    setBusy('importing')
    setMsg('正在从 QQ 云端同步并导入…（条数多时需几分钟）')
    try {
      const d = await post('/api/import/qce', { peer_uid: targetUid })
      setMsg(`导入完成：${d.result.added} 条新消息入库`)
    } catch (e) { setMsg('导入失败: ' + e.message) }
    setBusy('')
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>配置与导入</b>
          <button className="ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-tabs">
          <button className={tab === 'llm' ? 'on' : ''} onClick={() => setTab('llm')}>LLM</button>
          <button className={tab === 'import' ? 'on' : ''} onClick={() => setTab('import')}>导入数据</button>
        </div>

        {tab === 'llm' && (
          <div className="modal-body">
            <p className="hint">支持任意 OpenAI 兼容接口（DeepSeek / MiniMax / 智谱 / Kimi / Ollama）</p>
            <label>API 地址<input value={cfg.base_url} placeholder="https://api.deepseek.com/v1"
              onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} /></label>
            <label>API Key<input value={cfg.api_key} placeholder="sk-..." type="password"
              onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} /></label>
            <label>模型<input value={cfg.model} placeholder="deepseek-chat"
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })} /></label>
            <div className="modal-actions">
              <button onClick={saveLlm} disabled={busy === 'saving'}>{busy === 'saving' ? '保存中…' : '保存配置'}</button>
              <button className="ghost" onClick={testLlm} disabled={busy === 'testing'}>测试连接</button>
            </div>
            {llmOn && <div className="ok-line">✓ LLM 已配置</div>}
            {msg && <div className="msg-line">{msg}</div>}
          </div>
        )}

        {tab === 'import' && (
          <div className="modal-body">
            <p className="hint">从 QQ 聊天记录导出工具 (QCE) 拉取云端完整历史，原文永久保存在本机数据库。</p>
            <p className="hint warn-hint">要求：本机已运行 QQ + NapCat + QCE（端口 40653）。</p>
            <label>好友<select value={targetUid} onChange={(e) => setTargetUid(e.target.value)}>
              {friends.length === 0 && <option value="">未获取到好友列表（QCE 未运行？）</option>}
              {friends.map((f) => <option key={f.uid} value={f.uid}>{f.name} ({f.uin})</option>)}
            </select></label>
            <div className="modal-actions">
              <button onClick={importQce} disabled={busy === 'importing' || busy === 'saving'}>
                {busy === 'importing' ? '同步中…' : '同步并导入完整历史'}
              </button>
            </div>
            {msg && <div className="msg-line">{msg}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
