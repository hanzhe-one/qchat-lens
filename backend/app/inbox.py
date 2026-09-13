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


def classify(text, url, label=""):
    lower = (text or "").lower()
    domain = _domain(url)

    public_hits = [k for k in ("公益", "免费", "白嫖", "送额度", "羊毛") if k in lower]
    relay_hits = [k for k in ("中转", "relay", "one-api", "new-api", "openai", "api", "接口", "key", "额度") if k in lower]
    ai_hits = [k for k in ("ai", "prompt", "chatgpt", "claude", "gemini", "工具") if k in lower]
    article_hits = [k for k in ("blog", "docs", "article", "文章", "教程", "github") if k in lower]

    if public_hits:
        category, tags = "公益站", ["免费", "公益"]
    elif relay_hits:
        category, tags = "中转站", ["API", "中转"]
    elif ai_hits:
        category, tags = "AI 工具", ["AI"]
    elif article_hits:
        category, tags = "技术文章", ["文章"]
    else:
        category, tags = "其他链接", ["待分类"]

    confidence = 65
    confidence += 8 if label else 0
    confidence += min(4 * sum(len(x) for x in (public_hits, relay_hits, ai_hits, article_hits)), 24)
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


def scan_inbox(db, session_id=None, limit=10000):
    messages = db.list_link_messages(session_id=session_id, limit=limit)
    candidate_ids = set()
    source_count = 0
    for msg in messages:
        text = msg.get("text") or ""
        for link in extract_links(text):
            url = link["url"]
            domain = _domain(url)
            info = classify(text, url, link.get("label", ""))
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
