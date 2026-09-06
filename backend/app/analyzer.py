"""分析编排：分批摘要打标 + 定期生成专题。混合策略，原始消息永不动。"""
import threading
import time

from . import llm
from .llm import DIGEST_SYSTEM, TOPIC_SYSTEM, MERGE_SYSTEM

BATCH = 80           # 每批分析的消息数（减小以降低单次输出超长断连风险）
TOPIC_EVERY_BATCHES = 3  # 每 N 批后重新归纳一次专题
MAX_RETRY = 3


class Analyzer:
    def __init__(self, cfg, db):
        self.cfg = cfg
        self.db = db
        self._lock = threading.Lock()
        self._running = False

    # ------- 配置 -------
    def ready(self):
        c = self.cfg.get("llm", {})
        return bool(c.get("base_url") and c.get("api_key") and c.get("model"))

    def _llm(self):
        c = self.cfg["llm"]
        return c["base_url"], c["api_key"], c["model"]

    # ------- 分析一批 -------
    def analyze_window(self, session_id):
        """取最早未分析的一批做摘要+标签，写库。返回是否处理了。"""
        if not self.ready():
            raise RuntimeError("LLM 未配置")
        rows = self.db.unanalyzed_window(session_id, BATCH)
        if not rows:
            return 0
        base, key, model = self._llm()
        payload = llm.build_messages_payload(rows)
        out = None
        last_err = None
        for attempt in range(MAX_RETRY + 1):
            try:
                out = llm.parse_json(llm.chat(base, key, model, [
                    {"role": "system", "content": DIGEST_SYSTEM},
                    {"role": "user", "content": payload},
                ]))
                break
            except Exception as e:
                last_err = e
                time.sleep(2 * (attempt + 1))
        if out is None:
            raise RuntimeError(f"LLM 分析失败(重试{MAX_RETRY}次): {last_err}")
        tags = out.get("tags", [])
        lo, hi = rows[0]["id"], rows[-1]["id"]
        with self._lock:
            for r in rows:
                self.db.set_message_tags(r["id"], tags, source="auto")
                self.db.upsert_message_analyzed(r["id"], 1)
            self.db.log_analysis("session", session_id, lo, hi, len(rows), "ok")
        return len(rows)

    def analyze_until_caught_up(self, session_id, max_batches=50, progress=None):
        """持续处理未分析消息直到追平。"""
        total = 0
        for i in range(max_batches):
            try:
                n = self.analyze_window(session_id)
            except Exception as e:
                if progress:
                    progress("error", str(e))
                raise
            if n == 0:
                break
            total += n
            if progress:
                progress("analyzed", total)
            if total >= self.db.count_messages(session_id):
                break
        return total

    # ------- 专题 -------
    def build_topics(self, session_id, msg_lo=None, msg_hi=None, chunk=120,
                     progress=None):
        """对一段区间消息做专题归纳。自动切片避免单次输出过长。"""
        if not self.ready():
            raise RuntimeError("LLM 未配置")
        s = self.db.get_session(session_id)
        if not s:
            raise RuntimeError("会话不存在")
        rows = self.db.list_messages(session_id, after_id=(msg_lo or 0) - 1,
                                     limit=20000)
        if msg_hi:
            rows = [r for r in rows if r["id"] <= msg_hi]
        if not rows:
            return 0
        base, key, model = self._llm()
        total_added = 0
        # 按时间顺序切成 chunk 大小的连续块（用 id 跨度切）
        chunks = []
        cur = []
        for r in rows:
            cur.append(r)
            if len(cur) >= chunk:
                chunks.append(cur)
                cur = []
        if cur:
            chunks.append(cur)
        for ci, seg in enumerate(chunks):
            payload = llm.build_messages_payload(seg)
            out = None
            last_err = None
            for attempt in range(MAX_RETRY + 1):
                try:
                    out = llm.parse_json(llm.chat(base, key, model, [
                        {"role": "system", "content": TOPIC_SYSTEM},
                        {"role": "user", "content": payload},
                    ]))
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(6 * (attempt + 1))
            if out is None:
                # 记录失败但继续后续切片，避免一次断连毁掉整轮
                self.db.log_analysis("topic", session_id, seg[0]["id"],
                                     seg[-1]["id"], len(seg), "error", str(last_err))
                continue
            valid_ids = {r["id"] for r in seg}
            with self._lock:
                for t in out.get("topics", []):
                    s_id, e_id = t.get("start_id"), t.get("end_id")
                    if not s_id or not e_id:
                        continue
                    if s_id not in valid_ids or e_id not in valid_ids:
                        continue
                    if e_id < s_id:
                        continue
                    span = [r for r in seg if s_id <= r["id"] <= e_id]
                    if not span:
                        continue
                    self.db.add_topic({
                        "session_id": session_id,
                        "title": (t.get("title") or "未命名")[:120],
                        "summary": (t.get("summary") or "")[:800],
                        "tags": t.get("tags", [])[:10],
                        "start_ts": span[0]["ts"], "end_ts": span[-1]["ts"],
                        "msg_min_id": s_id, "msg_max_id": e_id,
                        "msg_count": len(span),
                    })
                    total_added += 1
            if progress:
                progress(ci + 1, len(chunks))
        return total_added
