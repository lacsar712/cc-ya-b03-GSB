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

登录后从**顶栏「机位色块墙」**进入专页：

- **左侧**为机位坐标维护，**右侧整面墙**可点「刷新整面墙」（也每 3 秒自动刷新）。
- 墙色的**唯一数据源**是 `GET /api/turbines/state`：每台机组只取 `yaw_logs` 中该机
  `status='done'` 且 **id 最大**的一笔（`LEFT JOIN LATERAL ... ORDER BY id DESC LIMIT 1`）。
  同机两笔近乎同时办结、`processed_at` 相同时，墙仍跟随**编号更大**的那笔。
- 颜色只映射服务端结论：`合格`→绿、`偏航超差`→红；**从未办结**（无 done 记录，仅有 pending）
  的机位保持**灰/无色**，绝不借墙暗示合格。待判定笔数以角标提示。
- 技师可直接**拖拽色块**或在左侧改 X/Y（`PUT /api/coords/<code>`，钳制 0–100，写库）；
  **观察员禁拖、禁改、禁报**（前端禁用 + 服务端 403 双重保证）。

## 验收

1. 种子数据：机组 W01 误差 0.4° 结论「合格」；机组 W07 误差 3.2° 结论「偏航超差」。
2. technician 提交新记录后，列表先显示「待处理」，数秒内 worker 处理后变为对应结论。
3. observer 可查看列表，无提交表单。
4. 色块墙：W01 初始为绿；技师对同一机 W01 再提交 3.2° 办结后，`/api/turbines/state`
   返回的 `verdict` 变为「偏航超差」、`log_id` 变为编号更大的新单，墙随之变红（非仅改前端）。
5. 从未办结的机位在墙上为灰；观察员拖坐标/填报均被 403 拒绝。

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
