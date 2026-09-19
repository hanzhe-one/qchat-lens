"""收集箱扫描：从聊天消息里提取链接并分类。

分类有两条路径：
- LLM（真 Agent）：结合上下文判断分类/摘要/标签/置信度，需配置 LLM。
- 确定性回退：纯关键词匹配，LLM 未配置或调用失败时使用。
"""
import re
from urllib.parse import urlsplit

from . import llm

LLM_BATCH = 15  # 每次 LLM 分类的链接数（控成本 + 降超长风险）

MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
URL_RE = re.compile(r"https?://[^\s\u4e00-\u9fa5<>'\"`]+", re.I)
TRAILING_PUNCTUATION = ".,;:!?)]}>」』》】）】，。；：！？"


def _clean_url(raw):
    return raw.strip().rstrip(TRAILING_PUNCTUATION)


def _domain(url):
    netloc = urlsplit(url).netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def extract_links(text):
    """Return unique links with optional markdown labels."""
    found = {}
    for label, url in MARKDOWN_LINK_RE.findall(text or ""):
        url = _clean_url(url)
        if url:
            found[url] = label.strip()
    for url in URL_RE.findall(text or ""):
        url = _clean_url(url)
        if url and url not in found:
            found[url] = ""
    return [{"url": url, "label": label} for url, label in found.items()]


def _title(text, url, label, domain):
    if label and 2 <= len(label) <= 60 and not label.startswith("http"):
        return label
    match = URL_RE.search(text or "")
    if match:
        prefix = (text[: match.start()] or "").strip()
        prefix = prefix.strip(" \t\r\n-—:：,，.。;；!！?？")
        if 2 <= len(prefix) <= 40:
            return prefix
    return domain or url


def _summary(text, url, domain):
    cleaned = URL_RE.sub(domain or "", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        cleaned = "来自聊天记录的链接"
    return cleaned[:180] + ("…" if len(cleaned) > 180 else "")


FALLBACK_CATEGORY = "其他链接"

# 仅在配置里没有 categories 时使用的兜底规则，故意保持通用。
DEFAULT_RULES = [
    ("工具", ["工具", "tool", "software", "app", "插件"], ["工具"]),
    ("文档教程", ["教程", "文档", "docs", "blog", "article", "文章", "guide", "指南"], ["文档"]),
    ("资源分享", ["资源", "分享", "下载", "免费", "free"], ["资源"]),
    ("项目仓库", ["github", "gitlab", "gitee", "开源", "repo", "project"], ["项目"]),
]


def build_rules(inbox_cfg):
    """把配置里的 categories 转成 (name, keywords, tags) 列表。

    分类完全由使用者自己的配置决定，代码不预设任何特定领域。
    配置缺失或为空时退回 DEFAULT_RULES。
    """
    raw = (inbox_cfg or {}).get("categories")
    if not raw:
        return DEFAULT_RULES
    rules = []
    for item in raw:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        keywords = [str(k).lower() for k in (item.get("keywords") or []) if str(k).strip()]
        tags = [str(t) for t in (item.get("tags") or []) if str(t).strip()]
        rules.append((name, keywords, tags))
    return rules or DEFAULT_RULES


def classify(text, url, label="", rules=None):
    lower = (text or "").lower()
    domain = _domain(url)
    rules = DEFAULT_RULES if rules is None else rules

    category, tags, hits = FALLBACK_CATEGORY, ["待分类"], 0
    for name, keywords, rule_tags in rules:
        matched = [k for k in keywords if k in lower]
        if matched:
            category, tags, hits = name, (rule_tags or ["待分类"]), len(matched)
            break

    confidence = 65
    confidence += 8 if label else 0
    confidence += min(4 * hits, 24)
    confidence = min(confidence, 94)

    status = "pending"
    note = f"Agent 根据聊天上下文和链接特征，将其归入「{category}」。"
    if confidence < 72:
        note += " 信息较少，建议人工确认。"

    return {
        "category": category,
        "tags": tags,
        "confidence": confidence,
        "status": status,
        "note": note,
    }


def _clamp_conf(v):
    try:
        return max(0, min(100, int(float(v))))
    except (TypeError, ValueError):
        return 60


def classify_with_llm(links, categories, llm_cfg):
    """用 LLM 结合上下文分类。links: [{'url','context'}]。
    返回 {url: {title,category,summary,tags,confidence}}；
    未配置或整批失败时该批缺省，调用方按 url 回退到确定性 classify。"""
    if not llm_cfg:
        return {}
    base, key, model = llm_cfg.get("base_url"), llm_cfg.get("api_key"), llm_cfg.get("model")
    if not (base and key and model):
        return {}
    out = {}
    for i in range(0, len(links), LLM_BATCH):
        chunk = links[i:i + LLM_BATCH]
        payload = llm.build_inbox_payload(chunk, categories)
        try:
            data = llm.parse_json(llm.chat(base, key, model, [
                {"role": "system", "content": llm.INBOX_SYSTEM},
                {"role": "user", "content": payload},
            ]))
        except Exception:
            continue  # 这批失败 → 相关链接回退确定性
        for it in (data.get("items") or []):
            if not isinstance(it, dict):
                continue
            u = it.get("url")
            if not u:
                continue
            out[u] = {
                "title": str(it.get("title") or "")[:120],
                "category": (str(it.get("category") or "").strip() or FALLBACK_CATEGORY)[:50],
                "summary": str(it.get("summary") or "")[:300],
                "tags": [str(t).strip()[:40] for t in (it.get("tags") or []) if str(t).strip()][:6],
                "confidence": _clamp_conf(it.get("confidence")),
            }
    return out


def scan_inbox(db, session_id=None, limit=10000, inbox_cfg=None, llm_cfg=None,
               reclassify=False):
    """扫描链接并入收集箱。

    llm_cfg 配了就走 LLM 真分类，否则确定性回退。为控成本，默认只对**新链接**
    调 LLM（已有候选跳过）；reclassify=True 时对全部链接重跑 LLM（供「AI 重新识别」）。
    """
    rules = build_rules(inbox_cfg)
    categories = [r[0] for r in rules]
    messages = db.list_link_messages(session_id=session_id, limit=limit)

    occurrences = []  # [(msg, link)]
    for msg in messages:
        for link in extract_links(msg.get("text") or ""):
            occurrences.append((msg, link))

    # 决定哪些链接送 LLM
    llm_map = {}
    if llm_cfg:
        existing = set() if reclassify else db.existing_candidate_urls()
        pending = {}
        for msg, link in occurrences:
            u = link["url"]
            if u in existing or u in pending:
                continue
            pending[u] = {"url": u, "context": msg.get("text") or ""}
        if pending:
            llm_map = classify_with_llm(list(pending.values()), categories, llm_cfg)

    candidate_ids = set()
    source_count = 0
    llm_used = 0
    for msg, link in occurrences:
        text = msg.get("text") or ""
        url = link["url"]
        domain = _domain(url)
        res = llm_map.get(url)
        if res:
            llm_used += 1
            category = res["category"]
            tags = res["tags"] or ["待分类"]
            summary = res["summary"] or _summary(text, url, domain)
            title = res["title"] or _title(text, url, link.get("label", ""), domain)
            confidence = res["confidence"]
            note = f"AI 结合上下文将其归入「{category}」。"
            if confidence < 60:
                note += " 把握一般，建议人工确认。"
        else:
            info = classify(text, url, link.get("label", ""), rules)
            category, tags, confidence, note = (
                info["category"], info["tags"], info["confidence"], info["note"])
            summary = _summary(text, url, domain)
            title = _title(text, url, link.get("label", ""), domain)
        rec = {
            "session_id": msg["session_id"],
            "message_id": msg["id"],
            "url": url,
            "domain": domain,
            "title": title,
            "category": category,
            "summary": summary,
            "tags": tags,
            "status": "pending",
            "confidence": confidence,
            "sender_name": msg.get("sender_name", ""),
            "ts": msg["ts"],
            "quote": text[:500],
            "note": note,
        }
        candidate_id = db.upsert_agent_candidate(rec)
        db.add_knowledge_source(candidate_id, rec)
        candidate_ids.add(candidate_id)
        source_count += 1
    return {
        "scanned_messages": len(messages),
        "candidates": len(candidate_ids),
        "sources": source_count,
        "llm_classified": llm_used,
    }
