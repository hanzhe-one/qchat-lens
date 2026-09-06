"""数据导入：把 QQ/TIM 数据源写入 QChat Lens 数据库。

当前支持：
- QCE (QQ Chat Exporter) 导出的 JSON 历史
- NapCat/OneBot11 WebSocket 实时增量
"""
import hashlib
import json
import threading
import time
from pathlib import Path

from . import config as cfg_mod


def _parse_ts(ts_str):
    """把 QCE 的 ISO 时间转毫秒。"""
    try:
        s = str(ts_str).replace("Z", "+00:00")
        return int(time.mktime(time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")) * 1000)
    except Exception:
        return int(time.time() * 1000)


class QCEImporter:
    """把 QCE 导出的 JSON 文件导入数据库。幂等：msg_key 去重。"""

    def __init__(self, db):
        self.db = db

    def import_file(self, json_path, self_uin=None):
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
        info = data.get("chatInfo", {})
        self_uin = self_uin or str(info.get("selfUin", ""))
        name = info.get("name") or info.get("peerName") or "未知会话"
        kind = "friend" if info.get("type") == "private" else \
            ("group" if info.get("type") == "group" else "unknown")
        peer_uin = str(info.get("peerUin", ""))
        session_id = f"{kind}:{peer_uin}"
        self.db.upsert_session({
            "id": session_id, "kind": kind, "peer_id": peer_uin,
            "name": name, "self_id": self_uin,
        })
        added = 0
        for m in data.get("messages", []):
            sender = m.get("sender", {})
            sender_uin = str(sender.get("uin", ""))
            direction = "out" if sender_uin == self_uin else "in"
            msg_type = m.get("type", "text")
            ts = _parse_ts(m.get("time", ""))
            text = self._message_text(m, msg_type)
            msg_key = str(m.get("id") or f"{m.get('seq','')}-{ts}")
            ok = self.db.insert_message(session_id, {
                "msg_key": msg_key,
                "seq": str(m.get("seq", "")),
                "ts": ts,
                "direction": direction,
                "sender_name": sender.get("name") or sender.get("nickname", ""),
                "msg_type": msg_type,
                "text": text,
                "raw": m,
            })
            if ok:
                added += 1
        return {"session_id": session_id, "name": name, "added": added,
                "file_total": len(data.get("messages", []))}

    def _message_text(self, m, msg_type):
        """从 QCE 消息里抽取可读文本（保留资源标记以便溯源）。"""
        content = m.get("content", {})
        text = content.get("text", "")
        if msg_type == "text":
            return text or ""
        elems = content.get("elements", [])
        marks = []
        for e in elems or []:
            et = e.get("type")
            d = e.get("data", {})
            if et == "image":
                marks.append(f"[图片:{d.get('filename','')}]")
            elif et == "file":
                marks.append(f"[文件:{d.get('filename','')}]")
            elif et == "audio" or et == "voice":
                marks.append(f"[语音]")
            elif et == "video":
                marks.append(f"[视频]")
        if marks:
            return "\n".join(marks)
        if text:
            return text
        return f"[{msg_type}]"


class NapCatLive:
    """NapCat/OneBot11 实时增量。独立线程收 WebSocket，写到 DB。"""

    def __init__(self, db, ws_url, whitelist, on_message=None):
        self.db = db
        self.ws_url = ws_url
        self.whitelist = whitelist
        self.on_message = on_message
        self._thread = None
        self._stop = False
        self.connected = False
        self.error = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop = True

    def _run(self):
        import websocket
        while not self._stop:
            try:
                ws = websocket.WebSocketApp(
                    self.ws_url,
                    on_open=lambda w: setattr(self, "connected", True),
                    on_close=lambda *a: setattr(self, "connected", False),
                    on_error=lambda w, e: setattr(self, "error", str(e)),
                    on_message=lambda w, data: self._handle(json.loads(data)),
                )
                ws.run_forever(ping_interval=20, ping_timeout=10)
            except Exception as e:
                self.error = str(e)
            self.connected = False
            time.sleep(3)

    def _handle(self, ev):
        post_type = ev.get("post_type")
        if post_type not in ("message", "message_sent"):
            return
        is_self = post_type == "message_sent" or ev.get("user_id") == ev.get("self_id")
        detail_type = ev.get("detail_type") or ev.get("message_type")
        self_id = str(ev.get("self_id", ""))
        if detail_type == "private":
            kind = "friend"
            peer = str(ev.get("user_id", ""))
            wl = self.whitelist.get("private", [])
            if wl and peer not in wl:
                return
            name = self._peer_name(peer)
        elif detail_type == "group":
            kind = "group"
            peer = str(ev.get("group_id", ""))
            wl = self.whitelist.get("groups", [])
            if wl and peer not in wl:
                return
            name = ""
        else:
            return
        sender = (ev.get("sender") or {}).get("nickname") or peer
        msg_key = f"live-{ev.get('message_id')}"
        ts = int(ev.get("time", time.time()) * 1000)
        text = self._onebot_text(ev.get("message"))
        session_id = f"{kind}:{peer}"
        self.db.upsert_session({
            "id": session_id, "kind": kind, "peer_id": peer,
            "name": name, "self_id": self_id,
        })
        ok = self.db.insert_message(session_id, {
            "msg_key": msg_key, "seq": str(ev.get("message_seq", "")),
            "ts": ts,
            "direction": "out" if is_self else "in",
            "sender_name": sender if not is_self else self_id,
            "msg_type": "text",
            "text": text,
            "raw": ev,
        })
        if ok and self.on_message:
            try:
                self.on_message(session_id, text)
            except Exception:
                pass

    def _peer_name(self, peer):
        # 预留：从通讯录缓存读取，当前用 uin
        return peer

    @staticmethod
    def _onebot_text(message):
        if isinstance(message, str):
            return message
        parts = []
        for seg in message or []:
            t = seg.get("type")
            d = seg.get("data") or {}
            if t == "text":
                parts.append(d.get("text", ""))
            elif t == "image":
                parts.append("[图片]")
            elif t == "file":
                parts.append(f"[文件:{d.get('file','')}]")
            elif t == "record":
                parts.append("[语音]")
            elif t == "video":
                parts.append("[视频]")
            elif t == "face":
                parts.append(f"[表情{d.get('id','')}]")
            else:
                parts.append(f"[{t}]")
        return "".join(parts).strip()
