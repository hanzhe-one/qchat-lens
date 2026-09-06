"""资源同步：解析每条消息 raw 里的 image/file 等元素，把 QCE 已下载的资源文件
复制到本项目 data/resources/，并在 resources 表登记 message↔文件 关联。"""
import json
import mimetypes
import shutil
import sqlite3
import time
from pathlib import Path

QCE_EXPORTS = Path.home() / "Documents" / "QQChatExporter" / "exports"


def _elements_from_raw(raw):
    if not isinstance(raw, dict):
        return []
    content = raw.get("content") or {}
    return content.get("elements", []) or []


def _resolve_source(elem_data):
    """在 QCE exports/resources 定位真实文件。data.url / data.localPath。"""
    for key in ("url", "localPath"):
        v = elem_data.get(key) or ""
        if not v:
            continue
        rel = v.replace("resources/", "", 1)
        for p in (QCE_EXPORTS / "resources" / rel, QCE_EXPORTS / rel):
            if p.is_file():
                return p
    return None


def _dst_path(cfg, session_id, md5, name, fallback):
    res_root = Path(cfg["resources_dir"])
    sess = res_root / session_id.replace(":", "_")
    sess.mkdir(parents=True, exist_ok=True)
    ext = Path(name or "").suffix
    fname = f"{md5 or fallback}{ext}"
    return sess / fname


def sync_session_resources(db, cfg, session_id, progress=None):
    """扫描会话全部消息 raw，复制资源文件入库。返回登记条数。"""
    with db.conn() as c:
        c.row_factory = sqlite3.Row
        rows = c.execute(
            "SELECT id, ts, raw FROM messages WHERE session_id=? ORDER BY id",
            (session_id,)).fetchall()

    db.clear_resources(session_id)
    added = 0
    for r in rows:
        msg_id, ts = r["id"], r["ts"]
        try:
            raw = json.loads(r["raw"])
        except Exception:
            continue
        for elem in _elements_from_raw(raw):
            et = elem.get("type")
            if et not in ("image", "file", "video", "voice", "audio"):
                continue
            d = elem.get("data") or {}
            name = d.get("filename", "")
            md5 = d.get("md5", "")
            src = _resolve_source(d)
            dest = _dst_path(cfg, session_id, md5, name, f"{msg_id}_{et}")
            if src and src.is_file():
                try:
                    if not dest.exists():
                        shutil.copy2(src, dest)
                    elif src.stat().st_size != dest.stat().st_size:
                        shutil.copy2(src, dest)
                except Exception:
                    dest = None
            rel = dest.relative_to(Path(cfg["resources_dir"])) if dest else ""
            db.insert_resource({
                "message_id": msg_id,
                "session_id": session_id,
                "kind": et,
                "name": name,
                "mime": mimetypes.guess_type(name or "x")[0] or "",
                "path": rel.as_posix() if rel else "",
                "src_md5": md5,
                "src_url": d.get("url", ""),
                "size": d.get("size", 0) or (src.stat().st_size if src and src.is_file() else 0),
                "width": d.get("width", 0),
                "height": d.get("height", 0),
                "ts": ts,
            })
            added += 1
    if progress:
        progress(added)
    return added
