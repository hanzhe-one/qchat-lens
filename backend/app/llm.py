"""LLM 客户端与分析提示词。支持 OpenAI 兼容接口。"""
import json
from pathlib import Path

import httpx

DIGEST_SYSTEM = """你是聊天记录分析引擎。输入是一批按时间顺序的聊天消息（JSON 数组，每行含 id/time/who/text）。
请输出 JSON（不要任何多余文字），结构：

{
  "tags": ["主题标签", ...],            // 3~8 个多维标签：主题维度(如"项目A"/"学习")、类型(如"任务安排"/"链接分享")
  "digest": "简短摘要（80~150字，概括这批聊了什么、关键点）",
  "action_items": ["待办/行动项，没有则空数组"],
  "key_facts": ["关键事实/结论/信息，含具体数字日期人名，没有则空数组"]
}

规则：
- 标签要具体可检索，不要用"聊天"/"消息"这种泛词
- 图片/文件消息文本为 [图片:文件名] 形式，可据此推断主题
- 忠实原文，不编造
"""

MERGE_SYSTEM = """你是聊天记录分析引擎。以下是同一会话相邻批次的独立分析结果，请合并为一份去重后的 JSON：
{
  "tags": ["合并去重后的多维标签"],
  "digest": "覆盖全部批次的统一摘要",
  "action_items": ["合并后的待办"],
  "key_facts": ["合并后的关键事实"]
}
只输出 JSON。"""

TOPIC_SYSTEM = """你是聊天记录分析器。输入若干消息(JSON数组，含 id/who/text)。请按主题聚类，输出 JSON：
{"topics":[{"title":"短标题","summary":"一句话","start_id":起始id,"end_id":结束id}]}

要求：2~6 个专题；start_id/end_id 必须是输入里真实出现的 id，区间覆盖连续消息；只输出 JSON。"""


def _api_url(base_url):
    base = (base_url or "").rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def chat(base_url, api_key, model, messages, timeout=180):
    url = _api_url(base_url)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": messages, "stream": False, "temperature": 0.3}
    with httpx.Client(timeout=timeout) as client:
        r = client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        # 兼容带 <think> 前缀的模型输出
        if "<think>" in content:
            content = content.split("<think>", 1)[1].split("</think>", 1)[-1]
        return content.strip()


def parse_json(text):
    """从模型输出里稳健地抽 JSON。"""
    if not text:
        raise ValueError("空响应")
    try:
        return json.loads(text)
    except Exception:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    start, end = text.find("["), text.rfind("]")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    raise ValueError(f"无法解析 LLM JSON 输出: {text[:200]}")


def build_messages_payload(rows):
    """把消息行压成可发送的文本块。"""
    parts = []
    for r in rows:
        who = "我" if r.get("direction") == "out" else r.get("sender_name", "对方")
        parts.append(json.dumps({
            "id": r["id"], "time": r.get("ts"), "who": who,
            "text": r.get("text", "")[:500],
        }, ensure_ascii=False))
    return "\n".join(parts)
