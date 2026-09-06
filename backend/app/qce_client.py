"""QCE (QQ Chat Exporter) HTTP 客户端：触发历史导出并等待文件就绪。"""
import json
import time
from pathlib import Path

import httpx

from . import config as cfg_mod

EXPORTS_DIR = Path.home() / "Documents" / "QQChatExporter" / "exports"


def _headers():
    sec = Path.home() / ".qq-chat-exporter" / "security.json"
    token = ""
    if sec.exists():
        try:
            token = json.loads(sec.read_text(encoding="utf-8")).get("accessToken", "")
        except Exception:
            pass
    return {"Authorization": f"Bearer {token}"}


def _base():
    return cfg_mod.load().get("qce", {}).get("base_url", "http://127.0.0.1:40653")


def qce_status():
    try:
        r = httpx.get(f"{_base()}/api/friends", headers=_headers(), timeout=8)
        return r.status_code == 200
    except Exception:
        return False


def qce_friends():
    try:
        r = httpx.get(f"{_base()}/api/friends", headers=_headers(), timeout=15)
        d = r.json()
        if d.get("success"):
            return [{"uid": f["uid"], "uin": str(f.get("uin", "")),
                     "name": f.get("remark") or f.get("nick") or str(f.get("uin", ""))}
                    for f in d["data"]["friends"]]
    except Exception:
        pass
    return []


def qce_export_and_wait(peer_uid, chat_type=1, timeout=150):
    """发起导出并等待导出文件写完（尺寸稳定 + JSON 可解析）。"""
    payload = {
        "peer": {"chatType": chat_type, "peerUid": peer_uid},
        "format": "JSON",
        "filter": {"includeRecalled": False},
        "options": {
            "batchSize": 5000,
            "includeResourceLinks": False,
            "includeSystemMessages": True,
            "filterPureImageMessages": False,
            "prettyFormat": True,
            "preferGroupMemberName": True,
            "debugExport": False
        }
    }
    r = httpx.post(f"{_base()}/api/messages/export", headers=_headers(),
                   json=payload, timeout=30)
    d = r.json()
    if not d.get("success"):
        raise RuntimeError(f"QCE 导出请求失败: {d}")
    task = d["data"]
    file_name = task.get("fileName", "")
    count = task.get("messageCount", 0)
    target = EXPORTS_DIR / file_name
    stable = 0
    last_size = -1
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(1.5)
        if not target.exists():
            continue
        size = target.stat().st_size
        if size == last_size and size > 0:
            stable += 1
            if stable >= 2:
                try:
                    data = json.loads(target.read_text(encoding="utf-8"))
                    return str(target), len(data.get("messages", []))
                except Exception:
                    pass
        else:
            stable = 0
            last_size = size
    return (str(target) if target.exists() else ""), count
