import asyncio
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import COORD_MAX, COORD_MIN, DEFAULT_COORD_MAX_X, DEFAULT_COORD_MAX_Y, SCHEMA, connect
from rules import judge

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


def seed_if_empty(conn):
    conn.execute(SCHEMA)
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("W01", 0.4, "合格", 10, 15),
        ("W07", 3.2, "偏航超差", 55, 60),
    ]
    for code, err, expected_verdict, pos_x, pos_y in samples:
        verdict, reason = judge(err)
        assert verdict == expected_verdict
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s)""",
            (code, err, verdict, reason, "technician", now, now),
        )
        conn.execute(
            """INSERT INTO turbine_coords (turbine_code, pos_x, pos_y, updated_by, updated_at)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (turbine_code) DO NOTHING""",
            (code, pos_x, pos_y, "technician", now),
        )


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


def require_writer(handler=None, *, message="仅现场技师可提交偏航记录"):
    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            user = await current_user()
            if user is None:
                return jsonify({"detail": "未登录"}), 401
            if user["role"] != "writer":
                return jsonify({"detail": message}), 403
            return await fn(user, *args, **kwargs)

        return wrapper

    if handler is not None:
        return decorator(handler)
    return decorator


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


def _default_pos(index: int) -> tuple[int, int]:
    """无坐标记录的新机位给一个确定性的默认网格落点。"""
    return (
        COORD_MIN + (index % DEFAULT_COORD_MAX_X) * (COORD_MAX // DEFAULT_COORD_MAX_X),
        COORD_MIN + (index // DEFAULT_COORD_MAX_X) * (COORD_MAX // DEFAULT_COORD_MAX_Y),
    )


@app.get("/api/turbines/state")
@require_login
async def turbine_state(user):
    """机位色块墙的唯一数据源。

    每台机组只取 yaw_logs 中该机 status='done' 且 id 最大的那笔作为墙色依据
    （同机两笔近乎同时办结时，编号更大的结论胜出）；从未办结的机组
    verdict 为 None，墙保持灰色。坐标缺省时补一个默认网格落点并落库。
    """

    def query():
        with connect() as conn:
            conn.execute(SCHEMA)
            rows = conn.execute(
                """
                SELECT t.turbine_code,
                       c.pos_x,
                       c.pos_y,
                       l.id        AS log_id,
                       l.yaw_err_deg,
                       l.verdict,
                       l.reason,
                       l.processed_at,
                       (SELECT COUNT(*) FROM yaw_logs p
                         WHERE p.turbine_code = t.turbine_code
                           AND p.status = 'pending') AS pending_count
                FROM (SELECT DISTINCT turbine_code FROM yaw_logs) t
                LEFT JOIN turbine_coords c ON c.turbine_code = t.turbine_code
                LEFT JOIN LATERAL (
                    SELECT id, yaw_err_deg, verdict, reason, processed_at
                    FROM yaw_logs
                    WHERE turbine_code = t.turbine_code
                      AND status = 'done'
                    ORDER BY id DESC
                    LIMIT 1
                ) l ON true
                ORDER BY t.turbine_code
                """
            ).fetchall()

            now = datetime.now(timezone.utc)
            changed = False
            for idx, row in enumerate(rows):
                if row["pos_x"] is None:
                    pos_x, pos_y = _default_pos(idx)
                    conn.execute(
                        """INSERT INTO turbine_coords
                           (turbine_code, pos_x, pos_y, updated_by, updated_at)
                           VALUES (%s, %s, %s, %s, %s)
                           ON CONFLICT (turbine_code) DO NOTHING""",
                        (row["turbine_code"], pos_x, pos_y, user["username"], now),
                    )
                    row["pos_x"] = pos_x
                    row["pos_y"] = pos_y
                    changed = True
            if changed:
                conn.commit()
            return rows

    rows = await run_db(query)
    return jsonify(rows)


@app.put("/api/coords/<turbine_code>")
@require_writer(message="仅现场技师可维护机位坐标，观察员只读")
async def update_coord(user, turbine_code):
    body = await request.get_json(force=True, silent=True) or {}
    try:
        pos_x = int(body.get("pos_x"))
        pos_y = int(body.get("pos_y"))
    except (TypeError, ValueError):
        return jsonify({"detail": "坐标必须是整数"}), 400
    pos_x = max(COORD_MIN, min(COORD_MAX, pos_x))
    pos_y = max(COORD_MIN, min(COORD_MAX, pos_y))

    now = datetime.now(timezone.utc)

    def upsert():
        with connect() as conn:
            conn.execute(SCHEMA)
            exists = conn.execute(
                "SELECT 1 FROM yaw_logs WHERE turbine_code = %s LIMIT 1",
                (turbine_code,),
            ).fetchone()
            if exists is None:
                return None
            conn.execute(
                """INSERT INTO turbine_coords
                   (turbine_code, pos_x, pos_y, updated_by, updated_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (turbine_code) DO UPDATE
                   SET pos_x = EXCLUDED.pos_x,
                       pos_y = EXCLUDED.pos_y,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = EXCLUDED.updated_at""",
                (turbine_code, pos_x, pos_y, user["username"], now),
            )
            conn.commit()
            return {
                "turbine_code": turbine_code,
                "pos_x": pos_x,
                "pos_y": pos_y,
                "updated_by": user["username"],
            }

    row = await run_db(upsert)
    if row is None:
        return jsonify({"detail": "该机位尚不存在"}), 404
    return jsonify(row)


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
