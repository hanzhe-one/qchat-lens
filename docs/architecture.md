# 开发说明 / 架构细节

本文档面向想要理解或贡献 QChat Lens 的开发者。

## 后端模块（backend/app/）

| 文件 | 职责 |
|---|---|
| `config.py` | 配置加载/保存/合并（含默认值），配置键见 README |
| `db.py` | SQLite 数据访问层，唯一读写数据库的地方。含 schema 与全部查询 |
| `importers.py` | `QCEImporter`（QCE 导出 JSON→库）+ `NapCatLive`（OneBot11 WebSocket 实时） |
| `qce_client.py` | 与 QCE HTTP API 交互：触发导出、等待文件、好友列表 |
| `analyzer.py` | `Analyzer`：分批摘要打标（analyze_window）、追平分析、专题归纳（build_topics 切片） |
| `llm.py` | OpenAI 兼容 chat 客户端 + 各分析提示词 + JSON 稳健解析 |
| `main.py` | FastAPI 应用与全部 REST 路由，启动时拉起实时监听线程 |

## 消息分析流水线

```
新消息(NapCat实时 / QCE导入)
        │
        ▼
  messages 表  analyzed=0
        │  用户触发 /api/analyze
        ▼
  Analyzer.analyze_window   每批≤80条 → LLM digest 输出
        │   {tags, digest, action_items, key_facts}
        ▼
  标签写回 message_tags(source=auto)，消息置 analyzed=1
        │  全部追平后
        ▼
  Analyzer.build_topics     每片≤120条 → LLM 输出专题{区间}
        ▼
  topics 表（title/summary/msg_min_id/msg_max_id）
```

- 幂等性：`analyze_window` 只处理 `analyzed=0`；重复触发不重复消费 token。
- 容错：单批 LLM 调用失败自动重试（MAX_RETRY=3，退避）；专题切片某片失败仅记日志不影响后续，可下次补齐。
- 隐私：`whitelist` 非空时，实时/导入仅保留白名单会话。

## 标签与专题的一致性设计

**标签**是"细粒度、附着于单条消息"的：一条消息可有多个标签，跨批次不要求全局一致（不同时间段主题自然不同）。

**专题**是"粗粒度、覆盖区间"的：一个专题对应一段连续消息区间，点击后列出该区间所有消息原文。

两种粒度互补：用户可"按标签筛"精准定位某话题的每条消息，也可"按专题"纵览一段主题脉络。

## 如何加一个数据源

1. 在 `importers.py` 新增类，产出统一的 `session + messages[]` 结构。
2. 复用 `db.upsert_session` / `db.insert_message`（msg_key 自带幂等去重）。
3. 在 `main.py` 暴露一个 `/api/import/<name>` 端点。
4. 前端 `ConfigPanel` 里加对应的导入入口。

消息结构约定：

```python
{
  "msg_key":   "<源端唯一ID>",      # 幂等去重用
  "seq":       "<源端序号>",
  "ts":        <毫秒时间戳>,
  "direction": "in" | "out",
  "sender_name": "<发送者昵称>",
  "msg_type":  "text" | "image" | "file" | ...,
  "text":      "<归一文本，图片/文件保留 [图片:x.jpg] 标记>",
  "raw":       <完整原始结构，任何 JSON，逐字段保留以便溯源>
}
```

## 前端结构（frontend/src/）

```
App.jsx             布局 + 视图状态 + 会话当前选中 + 全局消息过滤状态
api.js              封装 + 时间格式化 + 热力图网格
components/
  Sidebar.jsx       会话列表 + 全局统计
  DashView.jsx      概览：热力图、标签云、类型计数、最近消息（均可点击跳转）
  HomeView.jsx      未选会话时的欢迎页 / 会话总览
  MessageList.jsx   消息流：类型/标签/日期/关键词过滤 + 无限滚动 + 按天分组
  MsgContent.jsx    单条消息渲染（文本/链接/图片缩略/文件卡片）
  TimelineView.jsx  消息时间线容器 + 详情右栏（标签编辑、原始JSON）
  TopicView.jsx     专题卡片网格 + 屏幕居中可折叠浮窗（含关联原文）
  GalleryView.jsx   图片/资源图库
  ConfigPanel.jsx   LLM 配置 + 数据导入
```

前端通过 Vite proxy `/api` → 后端 8770（开发时），生产构建后由 FastAPI 直接托管 `dist/`。

## 测试与验证

后端无第三方库依赖可跑单测（标准库 + 项目依赖）。快速验证：

```bash
cd backend
python -m uvicorn app.main:app --port 8770   # 起服务
# 然后浏览器访问 /docs 可交互调试全部 API
```

端到端冒烟：导入真实数据 → `/api/analyze` → 轮询 `/api/analyze/status` → 检查 `/api/sessions/{id}/topics`。
