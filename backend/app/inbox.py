"""Deterministic inbox scanner: extract and classify links from chat messages."""
import re
from urllib.parse import urlsplit

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


def scan_inbox(db, session_id=None, limit=10000, inbox_cfg=None):
    rules = build_rules(inbox_cfg)
    messages = db.list_link_messages(session_id=session_id, limit=limit)
    candidate_ids = set()
    source_count = 0
    for msg in messages:
        text = msg.get("text") or ""
        for link in extract_links(text):
            url = link["url"]
            domain = _domain(url)
            info = classify(text, url, link.get("label", ""), rules)
            rec = {
                "session_id": msg["session_id"],
                "message_id": msg["id"],
                "url": url,
                "domain": domain,
                "title": _title(text, url, link.get("label", ""), domain),
                "category": info["category"],
                "summary": _summary(text, url, domain),
                "tags": info["tags"],
                "status": info["status"],
                "confidence": info["confidence"],
                "sender_name": msg.get("sender_name", ""),
                "ts": msg["ts"],
                "quote": text[:500],
                "note": info["note"],
            }
            candidate_id = db.upsert_agent_candidate(rec)
            db.add_knowledge_source(candidate_id, rec)
            candidate_ids.add(candidate_id)
            source_count += 1
    return {
        "scanned_messages": len(messages),
        "candidates": len(candidate_ids),
        "sources": source_count,
    }
