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

CREATE TABLE IF NOT EXISTS turbine_coords (
    turbine_code text PRIMARY KEY,
    pos_x integer NOT NULL,
    pos_y integer NOT NULL,
    updated_by text,
    updated_at timestamptz NOT NULL
);
"""

# 墙画布坐标范围（百分比，0..100），写入时钳制
COORD_MIN = 0
COORD_MAX = 100

# 新机组默认落点，按编号尾部取模铺一个起始网格
DEFAULT_COORD_MAX_X = 5
DEFAULT_COORD_MAX_Y = 4
