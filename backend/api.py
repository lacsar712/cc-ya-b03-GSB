import asyncio
import math
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import SCHEMA, clamp_position, connect
from rules import judge, wall_color

SECRET = os.environ.get("JWT_SECRET", "yaw-align-dev-secret")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = {
    "technician": {
        "role": "writer",
        "password_hash": pwd.hash("tech123456"),
    },
    "observer": {
        "role": "reader",
        "password_hash": pwd.hash("obs123456"),
    },
}

app = Quart(__name__)


def _run_db(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def run_db(fn, *args, **kwargs):
    return await asyncio.to_thread(_run_db, fn, *args, **kwargs)


TURBINE_SEEDS = [
    ("W01", 12.0, 25.0),
    ("W02", 37.0, 25.0),
    ("W03", 62.0, 25.0),
    ("W04", 87.0, 25.0),
    ("W05", 12.0, 70.0),
    ("W06", 37.0, 70.0),
    ("W07", 62.0, 70.0),
    ("W08", 87.0, 70.0),
]


def seed_if_empty(conn):
    conn.execute(SCHEMA)
    if conn.execute("SELECT COUNT(*) AS n FROM turbines").fetchone()["n"] == 0:
        for code, x, y in TURBINE_SEEDS:
            conn.execute(
                "INSERT INTO turbines (turbine_code, x, y) VALUES (%s, %s, %s)",
                (code, x, y),
            )
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("W01", 0.4, "合格"),
        ("W07", 3.2, "偏航超差"),
    ]
    for code, err, expected_verdict in samples:
        verdict, reason = judge(err)
        assert verdict == expected_verdict
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s)""",
            (code, err, verdict, reason, "technician", now, now),
        )


def turbine_rows(conn, turbine_code=None):
    """机位色块墙数据：每台机一行，结论取自该机最近办结记录。

    两单几近同时办结时按编号更大的那笔（ORDER BY id DESC LIMIT 1）。
    从未办结的机位 verdict 为 NULL，墙色 gray。
    """
    sql = """
        SELECT t.turbine_code, t.x, t.y,
               l.id AS source_log_id, l.verdict, l.processed_at
        FROM turbines t
        LEFT JOIN LATERAL (
            SELECT id, verdict, processed_at
            FROM yaw_logs
            WHERE yaw_logs.turbine_code = t.turbine_code
              AND status = 'done'
            ORDER BY id DESC
            LIMIT 1
        ) l ON TRUE
    """
    params = ()
    if turbine_code is not None:
        sql += " WHERE t.turbine_code = %s"
        params = (turbine_code,)
    sql += " ORDER BY t.turbine_code"
    rows = conn.execute(sql, params).fetchall()
    for row in rows:
        row["wall_color"] = wall_color(row["verdict"])
    return rows


def auto_position(conn):
    """新机组上墙时的默认空位：按 4 列网格顺排。"""
    n = conn.execute("SELECT COUNT(*) AS n FROM turbines").fetchone()["n"]
    x = 12.0 + (n % 4) * 25.0
    y = 25.0 + (n // 4) * 45.0
    return clamp_position(x), clamp_position(y)


@app.before_serving
async def startup():
    def init():
        with connect() as conn:
            seed_if_empty(conn)
            conn.commit()

    await run_db(init)


def parse_bearer():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


async def current_user():
    token = parse_bearer()
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub not in USERS:
        return None
    return {"username": sub, "role": payload.get("role")}


def require_login(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        return await handler(user, *args, **kwargs)

    return wrapper


def require_writer_with(message):
    def decorator(handler):
        @wraps(handler)
        async def wrapper(*args, **kwargs):
            user = await current_user()
            if user is None:
                return jsonify({"detail": "未登录"}), 401
            if user["role"] != "writer":
                return jsonify({"detail": message}), 403
            return await handler(user, *args, **kwargs)

        return wrapper

    return decorator


require_writer = require_writer_with("仅现场技师可提交偏航记录")


@app.get("/api/health")
async def health():
    return jsonify({"status": "ok", "service": "yaw-align-log"})


@app.post("/api/auth/login")
async def login():
    body = await request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = USERS.get(username)
    if not user or not pwd.verify(password, user["password_hash"]):
        return jsonify({"detail": "用户名或密码错误"}), 401
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": username, "role": user["role"], "exp": exp},
        SECRET,
        algorithm="HS256",
    )
    return jsonify(
        {
            "access_token": token,
            "username": username,
            "role": user["role"],
        }
    )


@app.get("/api/logs")
@require_login
async def list_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, yaw_err_deg, status, verdict, reason,
                          created_by, created_at, processed_at
                   FROM yaw_logs ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/logs")
@require_writer
async def create_log(user):
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        yaw_err_deg = float(body.get("yaw_err_deg"))
    except (TypeError, ValueError):
        return jsonify({"detail": "偏航误差必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            ax, ay = auto_position(conn)
            conn.execute(
                """INSERT INTO turbines (turbine_code, x, y)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (turbine_code) DO NOTHING""",
                (turbine_code, ax, ay),
            )
            row = conn.execute(
                """INSERT INTO yaw_logs
                   (turbine_code, yaw_err_deg, status, verdict, reason,
                    created_by, created_at)
                   VALUES (%s, %s, 'pending', NULL, NULL, %s, %s)
                   RETURNING id, turbine_code, yaw_err_deg, status, verdict, reason,
                             created_by, created_at, processed_at""",
                (turbine_code, yaw_err_deg, user["username"], now),
            ).fetchone()
            conn.commit()
            return row

    row = await run_db(insert)
    return jsonify(row), 201


@app.get("/api/turbines")
@require_login
async def list_turbines(user):
    def query():
        with connect() as conn:
            return turbine_rows(conn)

    rows = await run_db(query)
    return jsonify(rows)


@app.put("/api/turbines/<turbine_code>/position")
@require_writer_with("仅现场技师可调整机位坐标")
async def update_turbine_position(user, turbine_code):
    body = await request.get_json(force=True, silent=True) or {}
    try:
        x = float(body.get("x"))
        y = float(body.get("y"))
    except (TypeError, ValueError):
        return jsonify({"detail": "坐标必须是数字"}), 400
    if not (math.isfinite(x) and math.isfinite(y)):
        return jsonify({"detail": "坐标必须是有限数字"}), 400
    x = clamp_position(x)
    y = clamp_position(y)

    def update():
        with connect() as conn:
            updated = conn.execute(
                """UPDATE turbines SET x = %s, y = %s
                   WHERE turbine_code = %s
                   RETURNING turbine_code""",
                (x, y, turbine_code),
            ).fetchone()
            if updated is None:
                return None
            conn.commit()
            return turbine_rows(conn, turbine_code)[0]

    row = await run_db(update)
    if row is None:
        return jsonify({"detail": "未知机组编号"}), 404
    return jsonify(row)
