import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type Turbine = {
  turbine_code: string;
  x: number;
  y: number;
  verdict: string | null;
  source_log_id: number | null;
  processed_at: string | null;
  wall_color: "green" | "red" | "gray";
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type View = "logs" | "wall";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 1080px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      color: #38bdf8;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.1rem;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 0.6rem 1rem;
      margin-bottom: 1rem;
    }
    .brand {
      font-weight: 700;
      color: #38bdf8;
      font-size: 1.05rem;
    }
    .topbar nav {
      display: flex;
      gap: 0.4rem;
    }
    .navbtn {
      background: transparent;
      color: #94a3b8;
    }
    .navbtn.active {
      background: #0284c7;
      color: #fff;
    }
    .spacer {
      flex: 1;
    }
    .who {
      color: #94a3b8;
      font-size: 0.85rem;
    }
    section {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #cbd5e1;
      margin-bottom: 0.25rem;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f1f5f9;
      margin-bottom: 0.75rem;
    }
    input.coord {
      width: 4.5rem;
      padding: 0.3rem 0.4rem;
      margin-bottom: 0;
    }
    button {
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      background: #0284c7;
      color: #fff;
      font-weight: 600;
    }
    button.secondary {
      background: #475569;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th,
    td {
      text-align: left;
      padding: 0.5rem 0.4rem;
      border-bottom: 1px solid #334155;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .ok {
      background: #14532d;
      color: #86efac;
    }
    .bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pending {
      background: #713f12;
      color: #fde68a;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .wallwrap {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .coord-panel {
      flex: 0 0 320px;
    }
    .wall-panel {
      flex: 1;
      min-width: 420px;
    }
    .hint {
      color: #94a3b8;
      font-size: 0.8rem;
      margin: 0 0 0.75rem;
    }
    .legend {
      display: flex;
      gap: 1rem;
      font-size: 0.8rem;
      color: #cbd5e1;
      margin: 0.5rem 0 0.75rem;
    }
    .legend span {
      display: flex;
      align-items: center;
    }
    .sw {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      margin-right: 0.35rem;
    }
    .sw.green {
      background: #22c55e;
    }
    .sw.red {
      background: #ef4444;
    }
    .sw.gray {
      background: #475569;
    }
    .wall {
      position: relative;
      height: 440px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      overflow: hidden;
    }
    .block {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 78px;
      padding: 0.4rem 0.2rem;
      border-radius: 6px;
      text-align: center;
      font-size: 0.78rem;
      user-select: none;
      touch-action: none;
      border: 2px solid transparent;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .block b {
      font-size: 0.85rem;
    }
    .block.green {
      background: #14532d;
      color: #86efac;
      border-color: #22c55e;
    }
    .block.red {
      background: #7f1d1d;
      color: #fca5a5;
      border-color: #ef4444;
    }
    .block.gray {
      background: #1e293b;
      color: #94a3b8;
      border-color: #475569;
    }
    .block.draggable {
      cursor: grab;
    }
    .block.dragging {
      cursor: grabbing;
      opacity: 0.85;
      z-index: 10;
    }
  `;

  @state() private session: Session | null = null;
  @state() private logs: LogRow[] = [];
  @state() private view: View = "logs";
  @state() private turbines: Turbine[] = [];
  @state() private coordDrafts: Record<string, { x: string; y: string }> = {};
  @state() private wallError = "";
  @state() private dragCode: string | null = null;
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private error = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        void this.tick();
        this._pollTimer = window.setInterval(() => this.tick(), 2000);
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  }

  private _pollTimer?: number;

  private tick() {
    void this.refreshLogs();
    if (this.view === "wall") {
      void this.refreshTurbines();
    }
  }

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async refreshLogs() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/logs", { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      this.logs = (await res.json()) as LogRow[];
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshTurbines(rebuildDrafts = false) {
    if (!this.session) return;
    try {
      const res = await fetch("/api/turbines", { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      const rows = (await res.json()) as Turbine[];
      if (this.dragCode) return; // 拖动中不覆盖本地位置
      this.turbines = rows;
      if (rebuildDrafts) {
        this.coordDrafts = Object.fromEntries(
          rows.map((t) => [
            t.turbine_code,
            { x: String(t.x), y: String(t.y) },
          ])
        );
      } else {
        const drafts = { ...this.coordDrafts };
        for (const t of rows) {
          if (!drafts[t.turbine_code]) {
            drafts[t.turbine_code] = { x: String(t.x), y: String(t.y) };
          }
        }
        this.coordDrafts = drafts;
      }
    } catch {
      /* ignore transient network errors */
    }
  }

  private async login() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.loginUser,
          password: this.loginPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "登录失败";
        return;
      }
      this.session = {
        token: data.access_token,
        username: data.username,
        role: data.role,
      };
      localStorage.setItem("yaw_session", JSON.stringify(this.session));
      await this.tick();
      this._pollTimer = window.setInterval(() => this.tick(), 2000);
    } catch {
      this.error = "无法连接接口";
    } finally {
      this.loading = false;
    }
  }

  private logout() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.session = null;
    this.logs = [];
    this.turbines = [];
    this.view = "logs";
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private setView(view: View) {
    this.view = view;
    this.error = "";
    this.wallError = "";
    if (view === "wall") {
      void this.refreshTurbines(true);
    } else {
      void this.refreshLogs();
    }
  }

  private async submitLog() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: this.turbineCode,
          yaw_err_deg: Number(this.yawErr),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "提交失败";
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      await this.refreshLogs();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private updateDraft(code: string, field: "x" | "y", value: string) {
    const cur = this.coordDrafts[code] ?? { x: "", y: "" };
    this.coordDrafts = {
      ...this.coordDrafts,
      [code]: { ...cur, [field]: value },
    };
  }

  private async saveDraft(code: string) {
    const draft = this.coordDrafts[code];
    if (!draft) return;
    const x = Number(draft.x);
    const y = Number(draft.y);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      this.wallError = "坐标必须是数字";
      return;
    }
    await this.savePosition(code, x, y);
  }

  private async savePosition(code: string, x: number, y: number) {
    this.wallError = "";
    const rx = Math.round(x * 10) / 10;
    const ry = Math.round(y * 10) / 10;
    try {
      const res = await fetch(
        `/api/turbines/${encodeURIComponent(code)}/position`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...this.authHeaders(),
          },
          body: JSON.stringify({ x: rx, y: ry }),
        }
      );
      if (res.status === 401) {
        this.logout();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        this.wallError = data.detail || "坐标保存失败";
        await this.refreshTurbines(true);
        return;
      }
      const updated = data as Turbine;
      this.turbines = this.turbines.map((t) =>
        t.turbine_code === code ? updated : t
      );
      this.coordDrafts = {
        ...this.coordDrafts,
        [code]: { x: String(updated.x), y: String(updated.y) },
      };
    } catch {
      this.wallError = "保存坐标时网络异常";
    }
  }

  private onBlockPointerDown(e: PointerEvent, code: string) {
    if (!this.isWriter) return; // 观察员禁改
    e.preventDefault();
    this.dragCode = code;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onBlockPointerMove(e: PointerEvent) {
    if (!this.dragCode) return;
    const wall = this.renderRoot.querySelector<HTMLElement>(".wall");
    if (!wall) return;
    const rect = wall.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(94, Math.max(6, ((e.clientY - rect.top) / rect.height) * 100));
    const code = this.dragCode;
    this.turbines = this.turbines.map((t) =>
      t.turbine_code === code ? { ...t, x, y } : t
    );
  }

  private async onBlockPointerUp() {
    if (!this.dragCode) return;
    const code = this.dragCode;
    this.dragCode = null;
    const t = this.turbines.find((row) => row.turbine_code === code);
    if (!t) return;
    await this.savePosition(code, t.x, t.y);
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  private renderLogs() {
    return html`
      <section>
        <div class="row-actions">
          <button
            class="secondary"
            ?disabled=${this.loading}
            @click=${this.refreshLogs}
          >
            刷新列表
          </button>
        </div>
      </section>

      ${this.isWriter
        ? html`
            <section>
              <h2>提交偏航记录</h2>
              <label>机组编号</label>
              <input
                placeholder="例如 W12"
                .value=${this.turbineCode}
                @input=${(e: Event) =>
                  (this.turbineCode = (e.target as HTMLInputElement).value)}
              />
              <label>偏航误差（度，可正可负）</label>
              <input
                type="number"
                step="0.1"
                .value=${this.yawErr}
                @input=${(e: Event) =>
                  (this.yawErr = (e.target as HTMLInputElement).value)}
              />
              <button ?disabled=${this.loading} @click=${this.submitLog}>
                提交（进入待认领队列）
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
            </section>
          `
        : null}

      <section>
        <h2>对中记录</h2>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map(
              (row) => html`
                <tr>
                  <td>${row.id}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>
                    <span
                      class="tag ${row.status === "pending" ? "pending" : "ok"}"
                    >
                      ${row.status === "pending" ? "待处理" : "已完成"}
                    </span>
                  </td>
                  <td>
                    ${row.verdict
                      ? html`<span class="tag ${this.verdictClass(row)}">
                          ${row.verdict}
                        </span>`
                      : "—"}
                  </td>
                  <td>${row.reason ?? "—"}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderWall() {
    return html`
      <div class="wallwrap">
        <section class="coord-panel">
          <h2>机位坐标维护</h2>
          <p class="hint">
            ${this.isWriter
              ? "技师可在此修改坐标，或直接拖动右侧色块。"
              : "观察员只读：不可调整坐标、不可提交记录。"}
          </p>
          <table>
            <thead>
              <tr>
                <th>机组</th>
                <th>X%</th>
                <th>Y%</th>
                ${this.isWriter ? html`<th></th>` : null}
              </tr>
            </thead>
            <tbody>
              ${this.turbines.map((t) => {
                const draft = this.coordDrafts[t.turbine_code] ?? {
                  x: String(t.x),
                  y: String(t.y),
                };
                return html`
                  <tr>
                    <td>${t.turbine_code}</td>
                    ${this.isWriter
                      ? html`
                          <td>
                            <input
                              class="coord"
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              .value=${draft.x}
                              @input=${(e: Event) =>
                                this.updateDraft(
                                  t.turbine_code,
                                  "x",
                                  (e.target as HTMLInputElement).value
                                )}
                            />
                          </td>
                          <td>
                            <input
                              class="coord"
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              .value=${draft.y}
                              @input=${(e: Event) =>
                                this.updateDraft(
                                  t.turbine_code,
                                  "y",
                                  (e.target as HTMLInputElement).value
                                )}
                            />
                          </td>
                          <td>
                            <button
                              class="secondary"
                              @click=${() => this.saveDraft(t.turbine_code)}
                            >
                              保存
                            </button>
                          </td>
                        `
                      : html`<td>${t.x}</td>
                          <td>${t.y}</td>`}
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </section>

        <section class="wall-panel">
          <div class="row-actions" style="justify-content: space-between;">
            <h2 style="margin: 0;">机位色块墙</h2>
            <button
              class="secondary"
              @click=${() => this.refreshTurbines(true)}
            >
              刷新整面墙
            </button>
          </div>
          <div class="legend">
            <span><i class="sw green"></i>合格</span>
            <span><i class="sw red"></i>偏航超差</span>
            <span><i class="sw gray"></i>未办结（暂无结论）</span>
          </div>
          <div class="wall">
            ${this.turbines.map(
              (t) => html`
                <div
                  class="block ${t.wall_color} ${this.isWriter
                    ? "draggable"
                    : ""} ${this.dragCode === t.turbine_code ? "dragging" : ""}"
                  style="left: ${t.x}%; top: ${t.y}%;"
                  title=${t.source_log_id
                    ? `结论来源单号 #${t.source_log_id}`
                    : "该机位暂无办结记录"}
                  @pointerdown=${(e: PointerEvent) =>
                    this.onBlockPointerDown(e, t.turbine_code)}
                  @pointermove=${this.onBlockPointerMove}
                  @pointerup=${this.onBlockPointerUp}
                  @pointercancel=${this.onBlockPointerUp}
                >
                  <b>${t.turbine_code}</b>
                  <span>${t.verdict ?? "未办结"}</span>
                </div>
              `
            )}
          </div>
          ${this.wallError ? html`<p class="err">${this.wallError}</p>` : null}
        </section>
      </div>
    `;
  }

  render() {
    if (!this.session) {
      return html`
        <h1>风机偏航对中台</h1>
        <p class="sub">
          现场技师提交偏航误差，后台 worker 认领后给出合格或偏航超差结论。
        </p>
        <section>
          <label>用户名</label>
          <input
            .value=${this.loginUser}
            @input=${(e: Event) =>
              (this.loginUser = (e.target as HTMLInputElement).value)}
          />
          <label>密码</label>
          <input
            type="password"
            .value=${this.loginPass}
            @input=${(e: Event) =>
              (this.loginPass = (e.target as HTMLInputElement).value)}
          />
          <button ?disabled=${this.loading} @click=${this.login}>登录</button>
          ${this.error ? html`<p class="err">${this.error}</p>` : null}
        </section>
      `;
    }

    return html`
      <header class="topbar">
        <span class="brand">风机偏航对中台</span>
        <nav>
          <button
            class="navbtn ${this.view === "logs" ? "active" : ""}"
            @click=${() => this.setView("logs")}
          >
            对中记录
          </button>
          <button
            class="navbtn ${this.view === "wall" ? "active" : ""}"
            @click=${() => this.setView("wall")}
          >
            机位色块墙
          </button>
        </nav>
        <span class="spacer"></span>
        <span class="who">
          ${this.session.username}
          （${this.isWriter ? "技师·可提交" : "观察员·只读"}）
        </span>
        <button class="secondary" @click=${this.logout}>退出</button>
      </header>
      ${this.view === "logs" ? this.renderLogs() : this.renderWall()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}
