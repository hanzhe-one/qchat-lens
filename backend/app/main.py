"""QChat Lens — FastAPI 后端主入口。"""
import json
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import analyzer as analyzer_mod
from . import config as cfg_mod
from .db import DB
from .importers import NapCatLive, QCEImporter

cfg_mod.ensure_dirs()
CONFIG = cfg_mod.load()
DB_PATH = CONFIG["database"]

app = FastAPI(title="QChat Lens", version="0.1.0")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

db = DB(DB_PATH)
analyzer = analyzer_mod.Analyzer(CONFIG, db)
qce_importer = QCEImporter(db)

# 后端目录
BACKEND = Path(__file__).resolve().parent.parent
PROJECT = BACKEND.parent
FRONTEND_DIST = PROJECT / "frontend" / "dist"

analysis_lock = threading.Lock()
analysis_state = {"running": False, "session_id": None, "done": 0, "error": None}


def _nlive():
    return NapCatLive(db, CONFIG["napcat"]["ws_url"], CONFIG["whitelist"],
                      on_message=_on_live)


def _on_live(session_id, text):
    # 新消息到达后，触发一次小范围分析（可选，默认只入库待人工分析）
    pass


# ============ 配置 ============
class LLMConfigReq(BaseModel):
    base_url: str
    api_key: str
    model: str


@app.get("/api/config")
def get_config():
    c = CONFIG["llm"]
    masked = c["api_key"][:4] + "****" + c["api_key"][-4:] if len(c["api_key"]) > 8 else c["api_key"]
    return {"ok": True, "config": {"base_url": c["base_url"], "api_key": masked, "model": c["model"]}}


@app.post("/api/config")
def set_config(req: LLMConfigReq):
    old = CONFIG["llm"].get("api_key", "")
    key = req.api_key
    if "****" in key:
        key = old
    CONFIG["llm"] = {"base_url": req.base_url.strip(), "api_key": key, "model": req.model.strip()}
    cfg_mod.save(CONFIG)
    return {"ok": True}


@app.post("/api/config/test")
def test_config():
    if not analyzer.ready():
        return {"ok": False, "error": "请先配置 LLM"}
    try:
        from .llm import chat
        base, key, model = CONFIG["llm"].values()
        reply = chat(base, key, model, [{"role": "user", "content": "回复：OK"}], timeout=30)
        return {"ok": True, "reply": reply[:100]}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


@app.get("/api/whitelist")
def get_whitelist():
    return {"ok": True, "whitelist": CONFIG["whitelist"]}


class WhitelistReq(BaseModel):
    private: list[str] = []
    groups: list[str] = []


@app.post("/api/whitelist")
def set_whitelist(req: WhitelistReq):
    CONFIG["whitelist"] = {"private": req.private, "groups": req.groups}
    cfg_mod.save(CONFIG)
    return {"ok": True}


# ============ 会话与消息 ============
@app.get("/api/sessions")
def list_sessions():
    return {"ok": True, "sessions": db.list_sessions()}


@app.get("/api/sessions/{session_id}/stats")
def session_stats(session_id: str):
    s = db.get_session(session_id)
    if not s:
        raise HTTPException(404, "会话不存在")
    st = db.stats(session_id)
    tags = db.list_tags()
    return {"ok": True, "session": s, "stats": st, "tags": tags}


@app.get("/api/sessions/{session_id}/messages")
def messages(session_id: str, after: int = 0, limit: int = Query(200, le=2000),
             tag: str = "", q: str = ""):
    msgs = db.list_messages(session_id, after_id=after, limit=limit, tag=tag, q=q)
    next_after = msgs[-1]["id"] if msgs else after
    has_more = len(msgs) >= limit
    return {"ok": True, "messages": msgs, "next_after": next_after, "has_more": has_more}


@app.get("/api/messages/{msg_id}")
def message_detail(msg_id: int):
    m = db.get_message(msg_id)
    if not m:
        raise HTTPException(404, "消息不存在")
    return {"ok": True, "message": m}


# ============ 标签 ============
@app.get("/api/tags")
def tags():
    return {"ok": True, "tags": db.list_tags()}


class TagMsgReq(BaseModel):
    msg_id: int
    tags: list[str]
    source: str = "manual"


@app.post("/api/messages/tags")
def set_msg_tags(req: TagMsgReq):
    db.set_message_tags(req.msg_id, req.tags, source=req.source)
    return {"ok": True}


# ============ 专题 ============
@app.get("/api/sessions/{session_id}/topics")
def topics(session_id: str):
    return {"ok": True, "topics": db.list_topics(session_id)}


@app.get("/api/topics/{topic_id}")
def topic_detail(topic_id: int):
    t = db.get_topic(topic_id)
    if not t:
        raise HTTPException(404, "专题不存在")
    msgs = db.topic_messages(topic_id)
    return {"ok": True, "topic": t, "messages": msgs}


@app.post("/api/topics/{topic_id}/archive")
def archive_topic(topic_id: int, archived: bool = True):
    db.archive_topic(topic_id, archived)
    return {"ok": True}


# ============ 分析 ============
class AnalyzeReq(BaseModel):
    session_id: str
    build_topics: bool = True


@app.post("/api/analyze")
def analyze_session(req: AnalyzeReq):
    if not db.get_session(req.session_id):
        raise HTTPException(404, "会话不存在")
    if analysis_state["running"]:
        raise HTTPException(409, "已有分析任务进行中")
    if not analyzer.ready():
        raise HTTPException(400, "LLM 未配置")

    def run():
        analysis_state.update(running=True, session_id=req.session_id, done=0, error=None)
        try:
            n = analyzer.analyze_until_caught_up(
                req.session_id,
                progress=lambda k, v: analysis_state.update(done=v))
            if req.build_topics:
                analyzer.build_topics(req.session_id)
            analysis_state["done"] = n
        except Exception as e:
            analysis_state["error"] = str(e)
        finally:
            analysis_state["running"] = False

    threading.Thread(target=run, daemon=True).start()
    return {"ok": True}


@app.get("/api/analyze/status")
def analyze_status():
    return {"ok": True, **analysis_state}


# ============ 导入 ============
class ImportQceReq(BaseModel):
    session_name: str = ""
    peer_uid: str = ""
    file_path: str = ""


@app.get("/api/qce/status")
def qce_status():
    from .qce_client import qce_status as _s
    return {"ok": True, "online": _s()}


@app.get("/api/qce/friends")
def qce_friends():
    from .qce_client import qce_friends as _f
    return {"ok": True, "friends": _f()}


@app.post("/api/import/qce")
def import_qce(req: ImportQceReq):
    """触发 QCE 导出并把结果 JSON 入库。"""
    from .qce_client import qce_export_and_wait
    if not req.peer_uid:
        raise HTTPException(400, "需要 peer_uid")
    try:
        path, count = qce_export_and_wait(req.peer_uid)
    except Exception as e:
        raise HTTPException(500, f"QCE 导出失败: {e}")
    if not path or not Path(path.replace("\\\\?\\", "")).exists():
        raise HTTPException(500, "QCE 未生成导出文件")
    real = Path(path.replace("\\\\?\\", ""))
    result = qce_importer.import_file(str(real))
    return {"ok": True, "result": result}


@app.get("/api/import/status")
def import_status():
    return {"ok": True, "imported_count": db.count_messages()}


# ============ 历史报告兼容（可选） ============
class SaveReportReq(BaseModel):
    title: str
    content: str
    session_id: str = ""


@app.get("/api/stats")
def overall_stats():
    return {"ok": True, "stats": db.stats(), "sessions": len(db.list_sessions()),
            "tags": len(db.list_tags()), "topics": len(db.list_topics())}


@app.on_event("startup")
def _startup():
    try:
        nlive = _nlive()
        nlive.start()
        app.state.nlive = nlive
    except Exception:
        pass


# ============ 静态 ============
@app.get("/")
def index():
    idx = FRONTEND_DIST / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return {"name": "QChat Lens API", "docs": "/docs",
            "hint": "前端未构建，先 cd frontend && npm i && npm run build"}


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
