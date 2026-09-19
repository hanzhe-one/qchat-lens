# QChat Lens · 14 天改造路线图

> 起点：2026-09-18（周五） ｜ 节奏：每天 30 分钟 ｜ 预计终点：2026-10-01
> 原则：每步**独立验收、独立提交**；当天做不完只交「最小可验收」部分，余量顺延到次日，不合并。

## 基线说明（2026-09-18 更新）

本路线图最初基于 09-06 的本地代码制定。执行 Day 1 时发现：**本地 clone 落后远端 6 个提交**，
另有 09-11 ~ 09-17 的开发（作者 Xiao Zhe）加入了「Agent 收集箱 + 全部知识」两大功能：

- 新增表 `agent_candidates` / `knowledge_items` / `knowledge_sources`
- 新增 `backend/app/inbox.py`、前端 `InboxView.jsx` / `KnowledgeView.jsx`
- 新增约 15 个 API（`/api/inbox/*`、`/api/knowledge/*`）

Day 1 的修复已 rebase 到最新代码之上并重新验证。**Day 2 起的目标需要对照新代码重新确认**
（原计划中的「知识沉淀」缺口可能已被 knowledge_items 部分覆盖，见 Day 2 备注）。

## 一、总目标

把代码 review 发现的问题按 **P0 → P3** 逐日修掉，让项目核心（**原文不可变 + AI 结果可重建**）真正自洽：

- **P0 止血**：堵住密钥泄露；专题不再重复堆叠；把 LLM 已经算出来但被丢弃的摘要/待办/事实存下来。
- **P1 质量**：标签从「批次级」修正到宣传的「消息级」；消灭 N+1 查询；上 FTS5 全文检索。
- **P2 工程**：本地鉴权、依赖补齐、幂等测试、DB 迁移。
- **P3 收尾**：清理死代码、对齐 README。

## 二、每天这 30 分钟怎么花

| 阶段 | 时长 | 谁做 |
|---|---|---|
| 改代码 | ~20 min | 我 |
| 跑验收 / 点 UI | ~5 min | 你 |
| commit | ~5 min | 你 |

**当天收尾条件**：验收命令通过 + 一次 commit。没 commit 不算完成。

## 三、进度总览

| Day | 日期 | 主题 | 优先级 | 状态 |
|---|---|---|---|---|
| 1 | 09-18 五 | 换密钥 + 专题先清后建 | P0 | ✅ 代码完成（密钥待你轮换） |
| 2 | 09-19 六 | 摘要/待办/事实落库（schema + 写入） | P0 | ✅ 完成 |
| 3 | 09-20 日 | 摘要展示（API + 前端） | P0 | ☐ |
| 4 | 09-21 一 | 标签消息级化（prompt + 写回） | P1 | ☐ |
| 5 | 09-22 二 | 标签消息级化（前端 + 旧数据兼容） | P1 | ☐ |
| 6 | 09-23 三 | 消灭 N+1 查询 | P1 | ☐ |
| 7 | 09-24 四 | FTS5 全文检索（建索引） | P1 | ☐ |
| 8 | 09-25 五 | FTS5 接入搜索 | P1 | ☐ |
| 9 | 09-26 六 | 鉴权 + CORS + 路径校验 | P2 | ☐ |
| 10 | 09-27 日 | 补依赖 + 测试脚手架 | P2 | ☐ |
| 11 | 09-28 一 | 幂等回归测试 | P2 | ☐ |
| 12 | 09-29 二 | DB 迁移机制 | P2 | ☐ |
| 13 | 09-30 三 | lifespan + 清死代码 | P3 | ☐ |
| 14 | 10-01 四 | README 对齐 + 全量回归 | P3 | ☐ |

---

## 四、每日详情

### Day 1 · 09-18（周五）— 止血：密钥安全 + 专题不再堆叠

**① 吊销并更换 API Key（你手动，约 5 分钟）**
- 背景：`backend/config.json` 里的 MiniMax key 已明文暴露。
- 操作：MiniMax 控制台 → 删除旧 key → 新建 → 填进界面「配置 / 导入 → LLM」→ 保存。
- 验收：点「测试连接」返回 `✓ 连接成功`。

**② `build_topics` 先清后建（我改）**
- `backend/app/db.py`：新增 `delete_topics(session_id, only_open=True)`（保留人工 `archived`）。
- `backend/app/analyzer.py`：`build_topics()` 开始前先调用清理。
- 验收：同一会话连点两次「分析 / 重建专题」，`topics` 数量**不翻倍**。
  ```bash
  # 分析前后各查一次，数字应稳定
  python -c "import sqlite3;c=sqlite3.connect('data/qchat.db');print(c.execute('select count(*) from topics').fetchone())"
  ```

### Day 2 · 09-19（周六）— 摘要 / 待办 / 关键事实落库（1/2）

> **先做核对**：远端新增的 `knowledge_items` 只覆盖「链接型知识」（url/title/summary），
> 与本节要存的「消息批次摘要」不是一回事 —— 摘要仍无处存放，本日任务依然成立。
> 但落库前先确认是否应挂到现有的 agent/knowledge 体系上，避免又造一张平行的表。

- 现状：`llm.py` 让模型输出 `digest / action_items / key_facts`，但 `analyze_window` **只写了 tags，其余全丢**。
- `db.py`：新增 `message_digests` 表（`session_id, msg_lo, msg_hi, digest, action_items JSON, key_facts JSON, created_at`）。
- `analyzer.py`：把整批的 digest / 待办 / 事实写入。
- 验收：分析后 DB 里能查到这批摘要。
  ```bash
  python -c "import sqlite3;c=sqlite3.connect('data/qchat.db');print(c.execute('select count(*) from message_digests').fetchone())"
  ```

### Day 3 · 09-20（周日）— 摘要展示（2/2）

- `main.py`：`/api/messages/{id}` 附带所属批次的 digest；新增 `/api/sessions/{id}/digests`。
- 前端：消息详情抽屉显示「本段摘要 / 待办 / 关键事实」；概览页显示最近摘要。
- 验收：UI 点开一条已分析消息，能看到摘要与待办。

### Day 4 · 09-21（周一）— 标签消息级化（1/2）

- 现状：一批 80 条共享同一组标签，与「为**消息**打标签」的宣传不符。
- `llm.py`：改 `DIGEST_SYSTEM`，输出结构改为逐条：
  `{"items":[{"id":123,"tags":["..."]}, ...],"digest":"...","action_items":[],"key_facts":[]}`
- `analyzer.py`：`analyze_window` 按 `id` 逐条写回（校验 id 属于本批）。
- 验收：一批消息里不同消息的标签**不再完全相同**。

### Day 5 · 09-22（周二）— 标签消息级化（2/2）

- 前端标签云 / 消息标签渲染确认；旧批次级数据保留不迁移（`analysis_log` 可追溯）。
- 加一个「重新分析」入口（清 `analyzed=0`）便于重建。
- 验收：标签云分布随消息级标签变化。

### Day 6 · 09-23（周三）— 消灭 N+1 查询

- `db.py::list_messages`：把逐条 `message_tags` / `message_resources` 改成**一次 JOIN 批量取**。
- 验收：万条级会话打开消息页，加载时间明显下降（前后各记一次时间）。

### Day 7 · 09-24（周四）— FTS5 全文检索（1/2）

- `db.py`：建 `messages_fts`（FTS5，中文用 `unicode61` 或 trigram）；导入/写入时同步。
- 附一次性 `rebuild` 脚本。
- 验收：`SELECT ... MATCH` 能命中中文关键词。

### Day 8 · 09-25（周五）— FTS5 接入搜索（2/2）

- `db.py::_base_where` 的 `q` 分支改用 FTS（带 `LIKE` 回退）；`main.py` 搜索参数不变。
- 验收：界面搜索走 FTS，结果正确且更快。

### Day 9 · 09-26（周六）— 鉴权 + CORS + 路径校验

- `main.py`：CORS 收紧到本机来源；加本地 token（首次生成写 config，前端带上）。
- `/api/resource`：`startswith` 改 `fp.is_relative_to(root.resolve())`。
- 验收：无 token 的请求被拒；带 token 正常；`../` 越权被拒。

### Day 10 · 09-27（周日）— 补依赖 + 测试脚手架

- `requirements.txt` 补 `pywebview / pythonnet / clr_loader`（或用 extras 分组）。
- 建 `backend/tests/`，pytest + 临时 DB fixture。
- 验收：`pytest` 能跑起来（哪怕只有 1 个 smoke）。

### Day 11 · 09-28（周一）— 幂等回归测试

- 用例：重复导入同一文件 `added` 不增；`analyze_window` 重复调用不重复消费；`build_topics` 连跑两次不翻倍。
- 验收：`pytest -q` 全绿。

### Day 12 · 09-29（周二）— DB 迁移机制

- `db.py`：加 `schema_version` 表 + 顺序迁移函数，替换散落的 `ALTER TABLE`。
- 验收：老库能自动升级，新库直接建到最新。

### Day 13 · 09-30（周三）— lifespan + 清死代码

- `@app.on_event("startup")` → `lifespan`；删 `analysis_lock`、未用的 `MERGE_SYSTEM`、`probe_res.py`、`assets/vite.svg`。
- 验收：服务正常启动，无未用告警。

### Day 14 · 10-01（周四）— README 对齐 + 全量回归

- README 与实际能力逐条核对（含新增的摘要功能）；补一句「实时监听默认只入库、不自动分析」的现状说明。
- 全量回归：导入 → 分析 → 专题 → 搜索 → 图库。
- 验收：走完一遍无报错；README 与代码一致。

---

## 五、约定

- **commit 格式**：`fix: ...` / `feat: ...` / `chore: ...`，一天一条，信息里写明验收结果。
- **顺延规则**：某天 30 分钟做不完 → 当天只交最小可验收部分，剩余拆到次日开头，**不跨天合并两个大改动**。
- **假期**：09-30 ~ 10-01 逢国庆，若不方便可整体顺延，节奏不变。
- **每日启动语**（你每天来说这一句即可）：`开始第 N 天`。
