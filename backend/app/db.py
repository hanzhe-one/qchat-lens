"""SQLite 数据访问层。核心原则：原始消息永不删改，分析结果可重建。"""
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,      -- friend:<uin> / group:<gid>
    kind          TEXT NOT NULL,         -- friend | group | self
    peer_id       TEXT NOT NULL,         -- uin 或 gid
    name          TEXT NOT NULL DEFAULT '',
    self_id       TEXT NOT NULL DEFAULT '',
    hidden        INTEGER NOT NULL DEFAULT 0,   -- 1=列表隐藏但数据保留
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    msg_key       TEXT NOT NULL,          -- 源端唯一键(用于幂等去重)
    seq           TEXT,
    ts            INTEGER NOT NULL,       -- 毫秒
    direction     TEXT NOT NULL,          -- in | out
    sender_name   TEXT NOT NULL DEFAULT '',
    msg_type      TEXT NOT NULL DEFAULT 'text',
    text          TEXT NOT NULL DEFAULT '',   -- 归一化文本(图片/文件保留标记)
    raw           TEXT NOT NULL DEFAULT '{}', -- 原始消息JSON全文(可溯源)
    analyzed      INTEGER NOT NULL DEFAULT 0, -- 0未分析 1已分析
    created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_msg ON messages(session_id, msg_key);
CREATE INDEX IF NOT EXISTS ix_msg_ts ON messages(session_id, ts);

CREATE TABLE IF NOT EXISTS tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE,
    kind    TEXT NOT NULL DEFAULT 'auto',  -- auto | manual
    count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS message_tags (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id),
    source     TEXT NOT NULL DEFAULT 'auto',  -- auto | manual
    PRIMARY KEY (message_id, tag_id)
);
CREATE INDEX IF NOT EXISTS ix_mt_tag ON message_tags(tag_id);

CREATE TABLE IF NOT EXISTS topics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',    -- 关联标签名数组
    start_ts    INTEGER,
    end_ts      INTEGER,
    msg_min_id  INTEGER,
    msg_max_id  INTEGER,
    msg_count   INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'open',  -- open | archived
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT NOT NULL,             -- session | topic | manual
    ref_id      TEXT,
    msg_lo      INTEGER,
    msg_hi      INTEGER,
    msg_count   INTEGER NOT NULL DEFAULT 0,
    prompt_kind TEXT NOT NULL DEFAULT 'digest',
    status      TEXT NOT NULL,             -- ok | error
    detail      TEXT,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL,
    kind        TEXT NOT NULL,             -- image | file | voice | video | audio
    name        TEXT NOT NULL DEFAULT '',  -- 原始文件名
    mime        TEXT NOT NULL DEFAULT '',
    path        TEXT NOT NULL DEFAULT '',  -- 项目内相对路径 data/resources/...
    src_md5     TEXT NOT NULL DEFAULT '',
    src_url     TEXT NOT NULL DEFAULT '',
    size        INTEGER NOT NULL DEFAULT 0,
    width       INTEGER NOT NULL DEFAULT 0,
    height      INTEGER NOT NULL DEFAULT 0,
    ts          INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_res_msg ON resources(message_id);
CREATE INDEX IF NOT EXISTS ix_res_ses ON resources(session_id, kind, ts);
CREATE INDEX IF NOT EXISTS ix_res_kind ON resources(session_id, kind);
"""


class DB:
    def __init__(self, path: str):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def conn(self):
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def _init_schema(self):
        with self.conn() as c:
            c.executescript(SCHEMA)
            cols = [r["name"] for r in c.execute("PRAGMA table_info(sessions)")]
            if "hidden" not in cols:
                c.execute("ALTER TABLE sessions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")

    # ---------- 会话 ----------
    def upsert_session(self, session):
        now = int(time.time() * 1000)
        with self.conn() as c:
            c.execute(
                "INSERT INTO sessions(id,kind,peer_id,name,self_id,created_at,updated_at)"
                " VALUES(?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at",
                (session["id"], session["kind"], session["peer_id"], session["name"],
                 session.get("self_id", ""), now, now))

    def list_sessions(self, include_hidden=False):
        with self.conn() as c:
            rows = c.execute(
                "SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id) msg_count,"
                " (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id AND m.analyzed=1) analyzed_count"
                " FROM sessions s WHERE s.hidden=0 ORDER BY s.updated_at DESC" if not include_hidden else
                "SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id) msg_count,"
                " (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id AND m.analyzed=1) analyzed_count"
                " FROM sessions s ORDER BY s.updated_at DESC").fetchall()
        return [dict(r) for r in rows]

    def set_hidden(self, session_id, hidden=True):
        with self.conn() as c:
            cur = c.execute("UPDATE sessions SET hidden=? WHERE id=?",
                            (1 if hidden else 0, session_id))
            return cur.rowcount > 0

    def get_session(self, session_id, include_hidden=False):
        with self.conn() as c:
            if include_hidden:
                r = c.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
            else:
                r = c.execute("SELECT * FROM sessions WHERE id=? AND hidden=0",
                              (session_id,)).fetchone()
        return dict(r) if r else None

    # ---------- 消息 ----------
    def insert_message(self, session_id, msg):
        with self.conn() as c:
            try:
                c.execute(
                    "INSERT INTO messages(session_id,msg_key,seq,ts,direction,sender_name,"
                    " msg_type,text,raw,analyzed,created_at)"
                    " VALUES(?,?,?,?,?,?,?,?,?,0,?)",
                    (session_id, msg["msg_key"], msg.get("seq"), msg["ts"],
                     msg["direction"], msg.get("sender_name", ""), msg.get("msg_type", "text"),
                     msg.get("text", ""), json.dumps(msg.get("raw", {}), ensure_ascii=False),
                     int(time.time() * 1000)))
                return True
            except sqlite3.IntegrityError:
                return False

    def upsert_message_analyzed(self, msg_id, analyzed=1):
        with self.conn() as c:
            c.execute("UPDATE messages SET analyzed=? WHERE id=?", (analyzed, msg_id))

    # kind: link|image|file|voice|video|all；返回 (sql_fragment, args)
    def _kind_sql(self, kind, prefix="m."):
        if not kind or kind == "all":
            return "", []
        if kind == "link":
            return f" AND {prefix}text LIKE '%http%'", []
        marker = {"image": "[图片:", "file": "[文件:",
                  "voice": "[语音", "video": "[视频"}.get(kind)
        if marker:
            return (f" AND ({prefix}text LIKE ? OR {prefix}id IN"
                    f" (SELECT r.message_id FROM resources r WHERE r.kind=?))",
                    [f"%{marker}%", kind])
        return (f" AND {prefix}id IN (SELECT r.message_id FROM resources r"
                f" WHERE r.kind=?)", [kind])

    def _base_where(self, session_id, tag=None, q=None, kind=None, ts_from=None,
                    ts_to=None, prefix="m."):
        sql = f" WHERE {prefix}session_id=?"
        args = [session_id]
        if kind and kind != "all":
            frag, a = self._kind_sql(kind, prefix)
            sql += frag
            args += a
        if ts_from:
            sql += f" AND {prefix}ts>=?"; args.append(ts_from)
        if ts_to:
            sql += f" AND {prefix}ts<=?"; args.append(ts_to)
        if tag:
            sql += (f" AND {prefix}id IN (SELECT mt.message_id FROM message_tags mt"
                    f" JOIN tags t ON t.id=mt.tag_id WHERE t.name=?)")
            args.append(tag)
        if q:
            sql += f" AND {prefix}text LIKE ?"
            args.append(f"%{q}%")
        return sql, args

    def count_filtered(self, session_id, tag=None, q=None, kind=None,
                       ts_from=None, ts_to=None):
        sql, args = self._base_where(session_id, tag, q, kind, ts_from, ts_to)
        with self.conn() as c:
            r = c.execute(f"SELECT COUNT(*) c FROM messages m{sql}", args).fetchone()
        return r["c"]

    def list_messages(self, session_id, after_id=0, limit=200, tag=None, q=None,
                      kind=None, ts_from=None, ts_to=None):
        """kind: link|image|file|voice|video|all。ts_from/ts_to 毫秒，含边界。"""
        sql, args = self._base_where(session_id, tag, q, kind, ts_from, ts_to)
        sql += " AND m.id>? ORDER BY m.id LIMIT ?"
        args += [after_id, limit]
        with self.conn() as c:
            rows = c.execute(f"SELECT m.* FROM messages m{sql}", args).fetchall()
        out = []
        for r in rows:
            m = dict(r)
            m["raw"] = json.loads(m["raw"])
            m["tags"] = self.message_tags(m["id"])
            m["resources"] = self.message_resources(m["id"])
            out.append(m)
        return out

    def get_message(self, msg_id):
        with self.conn() as c:
            r = c.execute("SELECT * FROM messages WHERE id=?", (msg_id,)).fetchone()
        if not r:
            return None
        m = dict(r)
        m["raw"] = json.loads(m["raw"])
        m["tags"] = self.message_tags(m["id"])
        m["resources"] = self.message_resources(m["id"])
        return m

    def message_range(self, lo_id, hi_id):
        with self.conn() as c:
            rows = c.execute("SELECT * FROM messages WHERE id BETWEEN ? AND ? ORDER BY id",
                             (lo_id, hi_id)).fetchall()
        return [dict(r) for r in rows]

    def unanalyzed_window(self, session_id, limit=400):
        """取最早的一批未分析消息。"""
        with self.conn() as c:
            rows = c.execute(
                "SELECT id,ts,text FROM messages WHERE session_id=? AND analyzed=0"
                " ORDER BY id LIMIT ?", (session_id, limit)).fetchall()
        return [dict(r) for r in rows]

    def count_messages(self, session_id=None):
        if session_id:
            with self.conn() as c:
                return c.execute("SELECT COUNT(*) c FROM messages WHERE session_id=?", (session_id,)).fetchone()["c"]
        with self.conn() as c:
            return c.execute("SELECT COUNT(*) c FROM messages").fetchone()["c"]

    def stats(self, session_id=None):
        with self.conn() as c:
            if session_id:
                r = c.execute(
                    "SELECT COUNT(*) total, SUM(analyzed) analyzed, MIN(ts) first_ts, MAX(ts) last_ts"
                    " FROM messages WHERE session_id=?", (session_id,)).fetchone()
                tc = c.execute("SELECT COUNT(*) c FROM topics WHERE session_id=?",
                               (session_id,)).fetchone()["c"]
            else:
                r = c.execute(
                    "SELECT COUNT(*) total, SUM(analyzed) analyzed, MIN(ts) first_ts, MAX(ts) last_ts"
                    " FROM messages").fetchone()
                tc = c.execute("SELECT COUNT(*) c FROM topics").fetchone()["c"]
        s = dict(r)
        s["topics_count"] = tc
        return s

    # ---------- 标签 ----------
    def _get_tag(self, c, name):
        r = c.execute("SELECT id FROM tags WHERE name=?", (name,)).fetchone()
        if r:
            return r["id"]
        c.execute("INSERT INTO tags(name,kind) VALUES(?,?)", (name, "auto"))
        return c.execute("SELECT id FROM tags WHERE name=?", (name,)).fetchone()["id"]

    def set_message_tags(self, msg_id, names, source="auto"):
        names = list(dict.fromkeys(x.strip() for x in names if x and x.strip()))
        with self.conn() as c:
            c.execute("DELETE FROM message_tags WHERE message_id=? AND source=?",
                      (msg_id, source))
            for n in names:
                tid = self._get_tag(c, n)
                c.execute("INSERT OR IGNORE INTO message_tags(message_id,tag_id,source)"
                          " VALUES(?,?,?)", (msg_id, tid, source))
        self._recount_tags()

    def list_tags(self, min_count=0):
        with self.conn() as c:
            rows = c.execute(
                "SELECT t.id,t.name,t.kind,t.count FROM tags t WHERE t.count>=?"
                " ORDER BY t.count DESC", (min_count,)).fetchall()
        return [dict(r) for r in rows]

    def message_tags(self, msg_id):
        with self.conn() as c:
            rows = c.execute(
                "SELECT t.name FROM tags t JOIN message_tags mt ON mt.tag_id=t.id"
                " WHERE mt.message_id=?", (msg_id,)).fetchall()
        return [r["name"] for r in rows]

    def _recount_tags(self):
        with self.conn() as c:
            c.execute("""UPDATE tags SET count=(SELECT COUNT(*) FROM message_tags
                        WHERE message_tags.tag_id=tags.id)""")

    # ---------- 专题 ----------
    def add_topic(self, topic):
        now = int(time.time() * 1000)
        with self.conn() as c:
            cur = c.execute(
                "INSERT INTO topics(session_id,title,summary,tags,start_ts,end_ts,"
                " msg_min_id,msg_max_id,msg_count,status,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (topic.get("session_id"), topic["title"], topic.get("summary", ""),
                 json.dumps(topic.get("tags", []), ensure_ascii=False),
                 topic.get("start_ts"), topic.get("end_ts"),
                 topic.get("msg_min_id"), topic.get("msg_max_id"),
                 topic.get("msg_count", 0), topic.get("status", "open"), now))
            return cur.lastrowid

    def list_topics(self, session_id=None):
        sql = "SELECT * FROM topics"
        args = []
        if session_id:
            sql += " WHERE session_id=?"
            args.append(session_id)
        sql += " ORDER BY created_at DESC"
        with self.conn() as c:
            rows = c.execute(sql, args).fetchall()
        out = []
        for r in rows:
            t = dict(r)
            t["tags"] = json.loads(t["tags"])
            out.append(t)
        return out

    def get_topic(self, topic_id):
        with self.conn() as c:
            r = c.execute("SELECT * FROM topics WHERE id=?", (topic_id,)).fetchone()
        if not r:
            return None
        t = dict(r)
        t["tags"] = json.loads(t["tags"])
        return t

    def archive_topic(self, topic_id, archived=True):
        with self.conn() as c:
            c.execute("UPDATE topics SET status=? WHERE id=?",
                      ("archived" if archived else "open", topic_id))

    def topic_messages(self, topic_id, limit=500):
        t = self.get_topic(topic_id)
        if not t or not t["msg_min_id"]:
            return []
        with self.conn() as c:
            rows = c.execute(
                "SELECT * FROM messages WHERE id BETWEEN ? AND ? ORDER BY id LIMIT ?",
                (t["msg_min_id"], t["msg_max_id"], limit)).fetchall()
        out = []
        for r in rows:
            m = dict(r)
            m["raw"] = json.loads(m["raw"])
            m["resources"] = self.message_resources(m["id"])
            out.append(m)
        return out

    # ---------- 分析日志 ----------
    def log_analysis(self, scope, ref_id, msg_lo, msg_hi, count, status, detail=""):
        with self.conn() as c:
            c.execute(
                "INSERT INTO analysis_log(scope,ref_id,msg_lo,msg_hi,msg_count,prompt_kind,status,detail,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?)",
                (scope, ref_id, msg_lo, msg_hi, count, "digest", status,
                 (detail or "")[:4000], int(time.time() * 1000)))

    # ---------- 活动统计 ----------
    def daily_activity(self, session_id=None, days=365):
        """按天聚合消息数（本地时区日边界），用于热力图。"""
        span = days * 24 * 3600 * 1000
        now = int(time.time() * 1000)
        if session_id:
            rows = self._q(
                "SELECT ts FROM messages WHERE session_id=? AND ts>=?",
                (session_id, now - span))
        else:
            rows = self._q("SELECT ts FROM messages WHERE ts>=?", (now - span,))
        buckets = {}
        import datetime
        for r in rows:
            day = datetime.datetime.fromtimestamp(r["ts"] / 1000).strftime("%Y-%m-%d")
            buckets[day] = buckets.get(day, 0) + 1
        return buckets

    def _q(self, sql, args=()):
        with self.conn() as c:
            return c.execute(sql, args).fetchall()

    def tag_message_ids(self, session_id=None):
        if session_id:
            rows = self._q(
                "SELECT t.name, COUNT(*) c FROM message_tags mt"
                " JOIN tags t ON t.id=mt.tag_id"
                " JOIN messages m ON m.id=mt.message_id"
                " WHERE m.session_id=? GROUP BY t.name ORDER BY c DESC",
                (session_id,))
        else:
            rows = self._q(
                "SELECT t.name, COUNT(*) c FROM message_tags mt"
                " JOIN tags t ON t.id=mt.tag_id GROUP BY t.name ORDER BY c DESC")
        return [{"name": r["name"], "count": r["c"]} for r in rows]

    # ---------- 资源 ----------
    def clear_resources(self, session_id=None):
        with self.conn() as c:
            if session_id:
                c.execute("DELETE FROM resources WHERE session_id=?", (session_id,))
            else:
                c.execute("DELETE FROM resources")

    def insert_resource(self, rec):
        with self.conn() as c:
            c.execute(
                "INSERT INTO resources(message_id,session_id,kind,name,mime,path,"
                " src_md5,src_url,size,width,height,ts,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (rec["message_id"], rec["session_id"], rec["kind"], rec["name"],
                 rec.get("mime", ""), rec.get("path", ""), rec.get("src_md5", ""),
                 rec.get("src_url", ""), rec.get("size", 0), rec.get("width", 0),
                 rec.get("height", 0), rec.get("ts", 0), int(time.time() * 1000)))

    def list_resources(self, session_id=None, kind=None, after_ts=0, limit=500):
        sql = "SELECT * FROM resources WHERE 1=1"
        args = []
        if session_id:
            sql += " AND session_id=?"; args.append(session_id)
        if kind:
            sql += " AND kind=?"; args.append(kind)
        if after_ts:
            sql += " AND ts<?"
            args.append(after_ts)
        sql += " ORDER BY ts DESC LIMIT ?"
        args.append(limit)
        rows = self._q(sql, args)
        return [dict(r) for r in rows]

    def message_resources(self, msg_id):
        rows = self._q("SELECT * FROM resources WHERE message_id=? ORDER BY id", (msg_id,))
        return [dict(r) for r in rows]

    def find_resource_by_path(self, rel_path):
        rows = self._q("SELECT * FROM resources WHERE path=? LIMIT 1", (rel_path,))
        return dict(rows[0]) if rows else None

    def count_resources(self, session_id=None):
        if session_id:
            rows = self._q("SELECT COUNT(*) c FROM resources WHERE session_id=?", (session_id,))
        else:
            rows = self._q("SELECT COUNT(*) c FROM resources")
        return rows[0]["c"]
