import os

import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


SCHEMA = """
CREATE TABLE IF NOT EXISTS yaw_logs (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verdict text,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS turbines (
    turbine_code text PRIMARY KEY,
    x double precision NOT NULL,
    y double precision NOT NULL
);
"""

# 机位色块墙坐标采用百分比（0-100），前端按容器宽高换算像素。
POSITION_MIN = 0.0
POSITION_MAX = 100.0


def clamp_position(value: float) -> float:
    return max(POSITION_MIN, min(POSITION_MAX, value))

