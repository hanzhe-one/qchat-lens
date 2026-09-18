"""QChat Lens — 本地配置管理"""
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
PROJECT_DIR = BASE_DIR.parent  # qchat-lens/


def _data_dir():
    # PyInstaller onefile: 数据写到 exe 旁的 data/；onedir 模式亦如此
    if getattr(sys, "frozen", False):
        root = Path(sys.executable).resolve().parent
    else:
        root = PROJECT_DIR
    return root / "data"


DATA_DIR = _data_dir()
DEFAULT_CONFIG_PATH = BASE_DIR / "config.json"

DEFAULTS = {
    "llm": {
        "base_url": "",
        "api_key": "",
        "model": "",
    },
    "database": str(DATA_DIR / "qchat.db"),
    "resources_dir": str(DATA_DIR / "resources"),
    "qce": {
        "base_url": "http://127.0.0.1:40653",
    },
    "napcat": {
        "ws_url": "ws://127.0.0.1:3001",
    },
    "whitelist": {
        "private": [],
        "groups": [],
    },
    # 收集箱的链接分类规则：按顺序匹配，命中第一条即归类。
    # keywords 为小写子串匹配。这里只放通用示例——请按自己的需要在
    # config.json 里改成你真正关心的分类，仓库里的默认值不携带任何个人偏好。
    "inbox": {
        "categories": [
            {"name": "工具", "keywords": ["工具", "tool", "software", "app", "插件"],
             "tags": ["工具"]},
            {"name": "文档教程", "keywords": ["教程", "文档", "docs", "blog", "article", "文章", "guide", "指南"],
             "tags": ["文档"]},
            {"name": "资源分享", "keywords": ["资源", "分享", "下载", "免费", "free"],
             "tags": ["资源"]},
            {"name": "项目仓库", "keywords": ["github", "gitlab", "gitee", "开源", "repo", "project"],
             "tags": ["项目"]},
        ],
    },
}


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # 数据库默认路径跟随 data 目录
    if DEFAULTS["database"].startswith(".") or "/" not in DEFAULTS["database"]:
        DEFAULTS["database"] = str(DATA_DIR / "qchat.db")


def load(path=DEFAULT_CONFIG_PATH):
    if getattr(sys, "frozen", False):
        # 打包后配置写到 exe 旁边，避免依赖源码树
        path = Path(sys.executable).resolve().parent / "config.json"
    cfg = json.loads(json.dumps(DEFAULTS))
    if path.exists():
        try:
            user = json.loads(path.read_text(encoding="utf-8"))
            _deep_merge(cfg, user)
        except Exception:
            pass
    return cfg


def save(cfg, path=DEFAULT_CONFIG_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def _deep_merge(base, override):
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
