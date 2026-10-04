# 风机偏航对中台

现场技师登记机组编号与偏航误差（度）；后台 worker 用数据库行锁认领待处理记录，按 ±1.5° 阈值写入「合格」或「偏航超差」。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3199 |
| 接口 | http://localhost:8199 |
| PostgreSQL | localhost:54399（库名 `yawalign`） |

## 账号

| 用户 | 密码 | 权限 |
|------|------|------|
| technician | tech123456 | 可提交 |
| observer | obs123456 | 只读 |

## 启动

```bash
cd projects/20-yaw-align-log
docker compose up --build
```

健康检查：`GET http://localhost:8199/api/health` → `{"status":"ok","service":"yaw-align-log"}`。

## 机位色块墙

登录后从顶栏进入「机位色块墙」专页：左侧维护机位坐标（百分比），右侧整面墙可手动刷新，并随轮询自动更新。

- 墙色唯一数据源是 `GET /api/turbines` 返回的 `wall_color`，由该机**最近办结**记录（`status='done'` 中编号最大的一笔）的结论推出：合格 → 绿、偏航超差 → 红、从未办结 → 灰（不得暗示合格）。
- 两单几近同时办结合计一机时，墙只跟随编号更大的那笔。
- 技师（writer）可在左侧改坐标或直接拖动墙上色块（`PUT /api/turbines/<机组>/position`，坐标按 0–100 钳制）；观察员（reader）只读，改坐标与提交记录均被接口拒绝（403）。
- 提交新机组的偏航记录后，该机位自动按空位上墙，办结前为灰色。

## 验收

1. 种子数据：机组 W01 误差 0.4° 结论「合格」；机组 W07 误差 3.2° 结论「偏航超差」。
2. technician 提交新记录后，列表先显示「待处理」，数秒内 worker 处理后变为对应结论。
3. observer 可查看列表，无提交表单。
4. 色块墙：W01 办结合格 → 墙变绿；同机再提交超差记录办结 → 墙变红，且 `GET /api/turbines` 中该机 `verdict`/`wall_color`/`source_log_id` 同步变化；未办结机位保持灰色。

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
