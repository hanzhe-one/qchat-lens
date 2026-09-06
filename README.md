# QChat Lens

把 QQ / TIM 的聊天记录变成可检索、可回顾、可洞察的个人知识库。

**核心理念：原始消息一字不改全部保留，AI 在数据之上叠加"理解"——标签、摘要、专题——让你像翻一本有目录的书一样浏览自己的对话历史。**

## 特性

- **原文永远保留**：每条消息的完整原文与原始数据（JSON）都存在本地 SQLite，AI 分析只是叠加层，可随时重建。
- **多维标签**：AI 为消息自动打标签（主题/类型/人物…），可人工修正；标签即检索入口。
- **专题归纳**：AI 把时间线聚类成"专题卡片"（如某门课、某次竞赛、某个项目），点开即回到关联原文。
- **双视图**：会话查看器（逐条时间线 + 消息详情）与专题视图（主题卡片瀑布流）自由切换。
- **增量分析**：新到的实时消息自动排队，攒够一批才消费 token 做摘要 + 打标（消息级 + 摘要混合策略）。
- **本地优先**：数据、分析、界面全在你自己电脑上，不依赖任何外部服务（LLM 除外，且可换任意 OpenAI 兼容接口）。

## 架构

```
┌────────────────────────────────────────────────────────────┐
│                      前端 React + Vite                      │
│   概览(标签云)   消息时间线+详情    专题卡片瀑布流             │
└───────────────────────────┬────────────────────────────────┘
                            │ REST /api
┌───────────────────────────▼────────────────────────────────┐
│                     FastAPI (backend/app)                   │
│   sessions · messages · tags · topics · analyze · import    │
│                                                            │
│   Analyzer: 分批摘要+打标 → SQLite   专题归纳(切片)          │
└───────────────────────────┬────────────────────────────────┘
                            │
              ┌─────────────┼─────────────────┐
              ▼             ▼                 ▼
     QCE 历史导出    NapCat WebSocket     (预留)其它源
     (QQ云端全量)     (实时增量消息)
```

## 数据源

| 来源 | 作用 | 说明 |
|---|---|---|
| QQ Chat Exporter (QCE) | 全量历史 | 读取 QQ 云端同步的完整会话（含老 TIM 迁移过来的），导出 JSON 后入库 |
| NapCat + QQNT | 实时增量 | 登录 QQ 的协议端，WebSocket 推送每条新消息 |

> TIM 老客户端的本地 `Msg3.0.db` 是腾讯 SQLCipher 变体（密钥在运行中的经典客户端内存），建议走官方云同步迁移到新版 QQ 后用 QCE 导出，不直接逆向解密。

## 快速开始

### 前置：登录并挂载数据源

1. 安装 [新版 QQ (QQNT)](https://im.qq.com/)，登录你的账号（老 TIM 历史会随云同步过来）。
2. 下载 [QQ Chat Exporter](https://github.com/shuakami/qq-chat-exporter) 完整包，运行 `launcher-user.bat`，扫码登录。
   - NapCat 会注入启动 QQ（后台），WebUI 默认 `http://localhost:40653/qce`。
3. 确认 WebSocket 服务器已启用：NapCat 配置里给当前账号开一个 `websocketServers`（如 `127.0.0.1:3001`）。应用启动时会连它收实时消息。

### 后端

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8770
```

首次打开 http://127.0.0.1:8770 ，在「配置 / 导入」里填 LLM（任意 OpenAI 兼容），选好友点「同步并导入完整历史」。

### 前端（开发模式）

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173（已代理 /api 到 8770）
npm run build    # 产物 dist/，由后端直接静态托管
```

## 数据库结构

```
sessions      会话（friend:uin / group:gid）
messages      消息（msg_key 幂等、ts 时间、text 归一文本、raw 原始JSON全文）
tags          标签词典
message_tags  消息×标签 关联
topics        专题卡片（title/summary/覆盖消息id区间）
analysis_log  分析执行日志（可审计、可重建）
```

## LLM 策略

- **消息级 + 摘要混合**：实时消息攒批（默认 80 条）→ 一次 LLM 调用产出该批的多维标签 + 摘要 + 待办 + 关键事实 → 标签写回每条消息。
- **专题归纳**：对整个会话（或指定区间）按 ~120 条切片，逐片让 LLM 输出"专题 → 消息id区间"映射，存入 topics。
- **成本可控**：只有 `analyzed=0` 的消息才会触发分析；可随时重跑；`/api/analyze` 幂等。
- 标签可人工增删（`source=manual`），后续分析自动避开已人工修正的消息。

## 配置

后端配置在 `backend/config.json`（首次运行自动生成）：

```json
{
  "llm": { "base_url": "", "api_key": "", "model": "" },
  "database": "../data/qchat.db",
  "qce": { "base_url": "http://127.0.0.1:40653" },
  "napcat": { "ws_url": "ws://127.0.0.1:3001" },
  "whitelist": { "private": [], "groups": [] }
}
```

- `whitelist.private` / `.groups`：非空时仅记录这些会话（建议配，隐私 + 省 token）。
- LLM 模型：任意 `chat/completions` 兼容服务，DeepSeek / MiniMax / 智谱 / Kimi / Ollama 均可。

## 风险提示

第三方 QQ 协议端（NapCat 等）非官方，有被腾讯风控/下线设备甚至封号的风险。**建议评估后自担风险使用**，也可只做"一次性历史导出"后关停协议端。

## 路线图

- [ ] 更多数据源导入器（微信/Telegram 导出）
- [ ] 全文检索增强（分词 / 高亮）
- [ ] 专题人工合并 / 打星标
- [ ] 按标签时间分布统计图表
- [ ] Docker 一键部署

## License

MIT
