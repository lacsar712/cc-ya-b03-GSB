import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

export type WallSession = {
  token: string;
  username: string;
  role: string;
};

export type TurbineState = {
  turbine_code: string;
  pos_x: number;
  pos_y: number;
  log_id: number | null;
  yaw_err_deg: number | null;
  verdict: string | null;
  reason: string | null;
  processed_at: string | null;
  pending_count: number;
};

// 状态色（深色面板上白字 AA）。含义一律同时由图标+文字承载，不靠颜色 alone。
const COLOR_OK = "#0a7f0a"; // 合格  — 白字对比 5.18:1
const COLOR_BAD = "#c53636"; // 偏航超差 — 白字对比 5.31:1
const COLOR_NONE = "#475569"; // 从未办结（灰/无色）— 白字对比 7.58:1

const POLL_MS = 3000;

type DragState = {
  code: string;
  pointerId: number;
  rect: DOMRect;
  origX: number;
  origY: number;
};

@customElement("turbine-wall")
export class TurbineWall extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .wall-layout {
      display: flex;
      gap: 1rem;
      align-items: stretch;
    }
    aside.coords {
      flex: 0 0 270px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1rem;
      box-sizing: border-box;
      max-height: 640px;
      overflow-y: auto;
    }
    aside.coords h2 {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
    }
    .hint {
      color: #94a3b8;
      font-size: 0.8rem;
      margin: 0 0 0.75rem;
      line-height: 1.4;
    }
    .coord-row,
    .coord-head {
      display: grid;
      grid-template-columns: 52px 1fr 1fr;
      gap: 0.4rem;
      align-items: center;
    }
    .coord-row {
      padding: 0.4rem 0;
      border-bottom: 1px solid #334155;
      font-size: 0.85rem;
    }
    .coord-head {
      font-size: 0.72rem;
      color: #94a3b8;
      padding: 0.2rem 0;
      border-bottom: 1px solid #475569;
    }
    .coord-row code {
      color: #e2e8f0;
      font-weight: 600;
    }
    .coord-row input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.3rem 0.4rem;
      border-radius: 5px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f1f5f9;
      font-size: 0.85rem;
    }
    .coord-row input:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .wall-main {
      flex: 1;
      min-width: 0;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1rem;
      box-sizing: border-box;
    }
    .wall-toolbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }
    .wall-toolbar h2 {
      margin: 0;
      font-size: 1.05rem;
    }
    .legend {
      display: flex;
      gap: 0.9rem;
      flex-wrap: wrap;
      font-size: 0.8rem;
      color: #cbd5e1;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .swatch {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: 3px;
      display: inline-block;
      border: 1px solid rgba(255, 255, 255, 0.18);
    }
    .wall-canvas {
      position: relative;
      width: 100%;
      height: 560px;
      border-radius: 8px;
      background-color: #0f172a;
      background-image:
        linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
      background-size: 40px 40px;
      overflow: hidden;
      border: 1px solid #334155;
    }
    .tile {
      position: absolute;
      width: 108px;
      min-height: 60px;
      box-sizing: border-box;
      border-radius: 8px;
      padding: 0.4rem 0.5rem;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
      transform: translate(-50%, -50%);
      user-select: none;
      touch-action: none;
      text-align: left;
    }
    .tile.ok {
      background: #0a7f0a;
    }
    .tile.bad {
      background: #c53636;
    }
    .tile.none {
      background: #475569;
      border-style: dashed;
    }
    .tile[data-writer="true"] {
      cursor: grab;
    }
    .tile.dragging {
      cursor: grabbing;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.55);
      z-index: 5;
    }
    .tile .code {
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
    }
    .tile .verdict {
      font-size: 0.78rem;
      margin-top: 0.15rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      white-space: nowrap;
    }
    .tile .err {
      font-size: 0.7rem;
      opacity: 0.85;
      margin-top: 0.1rem;
    }
    .tile .pending-badge {
      position: absolute;
      top: -8px;
      right: -8px;
      background: #713f12;
      color: #fde68a;
      border: 1px solid #a16207;
      font-size: 0.66rem;
      line-height: 1;
      padding: 0.18rem 0.32rem;
      border-radius: 999px;
      white-space: nowrap;
    }
    .empty {
      color: #94a3b8;
      padding: 2rem;
      text-align: center;
    }
    .err-msg {
      color: #f87171;
      font-size: 0.8rem;
      margin: 0.5rem 0 0;
    }
    .muted {
      color: #94a3b8;
      font-size: 0.75rem;
    }
    button {
      cursor: pointer;
      padding: 0.45rem 0.9rem;
      border-radius: 6px;
      border: none;
      background: #0284c7;
      color: #fff;
      font-weight: 600;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @property({ attribute: false }) session: WallSession | null = null;

  @state() private turbines: TurbineState[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private lastUpdated = "";

  // 拖拽中的临时坐标（不落前端颜色，仅位置）；松开后以服务端返回为准
  private _drag: DragState | null = null;
  private _overrides = new Map<string, { x: number; y: number }>();
  private _pollTimer?: number;

  connectedCallback() {
    super.connectedCallback();
    void this.refresh();
    this._pollTimer = window.setInterval(() => void this.refresh(false), POLL_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private authHeaders(extra: HeadersInit = {}): HeadersInit {
    return {
      ...(this.session ? { Authorization: `Bearer ${this.session.token}` } : {}),
      ...extra,
    };
  }

  private _unauthorized() {
    this.dispatchEvent(
      new CustomEvent("yaw-unauthorized", { bubbles: true, composed: true }),
    );
  }

  async refresh(showLoading = true) {
    if (!this.session) return;
    if (showLoading) this.loading = true;
    try {
      const res = await fetch("/api/turbines/state", {
        headers: this.authHeaders(),
      });
      if (res.status === 401) {
        this._unauthorized();
        return;
      }
      if (!res.ok) {
        this.error = `墙状态获取失败（${res.status}）`;
        return;
      }
      this.turbines = (await res.json()) as TurbineState[];
      this.error = "";
      this.lastUpdated = new Date().toLocaleTimeString();
    } catch {
      this.error = "刷新时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private posX(t: TurbineState) {
    return this._overrides.get(t.turbine_code)?.x ?? t.pos_x;
  }

  private posY(t: TurbineState) {
    return this._overrides.get(t.turbine_code)?.y ?? t.pos_y;
  }

  private static clampPct(v: number) {
    return Math.max(0, Math.min(100, v));
  }

  // —— 颜色唯一映射：只认服务端该机最近一笔 status=done 的 verdict ——
  private tileClass(t: TurbineState) {
    if (t.verdict === "合格") return "ok";
    if (t.verdict === "偏航超差") return "bad";
    return "none"; // 从未办结：灰，不得暗示合格
  }

  private verdictIcon(t: TurbineState) {
    if (t.verdict === "合格") return "✓";
    if (t.verdict === "偏航超差") return "✕";
    return "○";
  }

  private verdictText(t: TurbineState) {
    return t.verdict ?? "未办结";
  }

  private tileTitle(t: TurbineState) {
    const base = `${t.turbine_code}：${
      t.log_id == null
        ? "尚无办结记录"
        : `最近办结单号 #${t.log_id}，结论 ${t.verdict}，误差 ${t.yaw_err_deg}°`
    }`;
    const tail = t.reason ? `\n${t.reason}` : "";
    const pending = t.pending_count > 0 ? `\n待判定记录 ${t.pending_count} 笔` : "";
    return base + tail + pending;
  }

  // —— 拖拽（仅技师；观察员的 pointerdown 直接忽略）——
  private onPointerDown(e: PointerEvent, t: TurbineState) {
    if (!this.isWriter) return;
    const canvas = this.renderRoot.querySelector(".wall-canvas") as HTMLElement | null;
    if (!canvas) return;
    this._drag = {
      code: t.turbine_code,
      pointerId: e.pointerId,
      rect: canvas.getBoundingClientRect(),
      origX: this.posX(t),
      origY: this.posY(t),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent) {
    const d = this._drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const x = TurbineWall.clampPct(
      ((e.clientX - d.rect.left) / d.rect.width) * 100,
    );
    const y = TurbineWall.clampPct(
      ((e.clientY - d.rect.top) / d.rect.height) * 100,
    );
    this._overrides.set(d.code, {
      x: Math.round(x),
      y: Math.round(y),
    });
    this.requestUpdate();
  }

  private async onPointerUp(e: PointerEvent) {
    const d = this._drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const target = this._overrides.get(d.code) ?? { x: d.origX, y: d.origY };
    this._drag = null;
    await this.saveCoord(d.code, target.x, target.y);
  }

  private async onManualCoord(e: Event, t: TurbineState, axis: "x" | "y") {
    const raw = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const x = axis === "x" ? TurbineWall.clampPct(raw) : this.posX(t);
    const y = axis === "y" ? TurbineWall.clampPct(raw) : this.posY(t);
    await this.saveCoord(t.turbine_code, x, y);
  }

  async saveCoord(code: string, x: number, y: number) {
    this.error = "";
    try {
      const res = await fetch(`/api/coords/${encodeURIComponent(code)}`, {
        method: "PUT",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pos_x: x, pos_y: y }),
      });
      if (res.status === 401) {
        this._unauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        this.error = "观察员无权维护坐标";
        this._overrides.delete(code);
        this.requestUpdate();
        return;
      }
      if (!res.ok) {
        this.error = data.detail || `坐标保存失败（${res.status}）`;
        this._overrides.delete(code);
        this.requestUpdate();
        return;
      }
      this._overrides.delete(code);
      await this.refresh();
    } catch {
      this.error = "保存坐标时网络异常";
      this._overrides.delete(code);
      this.requestUpdate();
    }
  }

  render() {
    return html`
      <div class="wall-layout">
        <aside class="coords">
          <h2>机位坐标维护</h2>
          <p class="hint">
            ${this.isWriter
              ? "技师可直接拖拽右侧色块，或在下方修改 X / Y 坐标（0–100）。"
              : "当前为观察员（只读）：不可拖拽、不可改坐标、不可填报。"}
          </p>
          ${this.turbines.length === 0
            ? html`<p class="muted">暂无机位。</p>`
            : html`
                <div class="coord-head">
                  <span>机位</span><span>X 坐标</span><span>Y 坐标</span>
                </div>
              `}
          ${this.turbines.map(
            (t) => html`
              <div class="coord-row">
                <code>${t.turbine_code}</code>
                <input
                  type="number"
                  min="0"
                  max="100"
                  aria-label="${t.turbine_code} X 坐标"
                  .value=${String(this.posX(t))}
                  ?disabled=${!this.isWriter}
                  @change=${(e: Event) => this.onManualCoord(e, t, "x")}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  aria-label="${t.turbine_code} Y 坐标"
                  .value=${String(this.posY(t))}
                  ?disabled=${!this.isWriter}
                  @change=${(e: Event) => this.onManualCoord(e, t, "y")}
                />
              </div>
            `,
          )}
          ${this.error ? html`<p class="err-msg">${this.error}</p>` : null}
        </aside>

        <div class="wall-main">
          <div class="wall-toolbar">
            <h2>机位色块墙</h2>
            <button ?disabled=${this.loading} @click=${this.refresh}>
              ${this.loading ? "刷新中…" : "刷新整面墙"}
            </button>
            <span class="muted"
              >墙色＝该机列表最近办结结论${this.lastUpdated
                ? ` · 更新于 ${this.lastUpdated}`
                : ""}</span
            >
            <div class="legend" role="list" aria-label="图例">
              <span role="listitem"><i class="swatch" style="background:${COLOR_OK}"></i>✓ 合格</span>
              <span role="listitem"><i class="swatch" style="background:${COLOR_BAD}"></i>✕ 偏航超差</span>
              <span role="listitem"><i class="swatch" style="background:${COLOR_NONE}"></i>○ 未办结（灰）</span>
            </div>
          </div>

          <div class="wall-canvas">
            ${this.turbines.length === 0
              ? html`<p class="empty">暂无机位，技师提交偏航记录后这里会生成色块。</p>`
              : this.turbines.map((t) => {
                  const dragging = this._drag?.code === t.turbine_code;
                  return html`
                    <div
                      class="tile ${classMap({
                        ok: this.tileClass(t) === "ok",
                        bad: this.tileClass(t) === "bad",
                        none: this.tileClass(t) === "none",
                        dragging,
                      })}"
                      data-writer=${String(this.isWriter)}
                      style="left:${this.posX(t)}%;top:${this.posY(t)}%;"
                      title=${this.tileTitle(t)}
                      @pointerdown=${(e: PointerEvent) => this.onPointerDown(e, t)}
                      @pointermove=${this.onPointerMove}
                      @pointerup=${this.onPointerUp}
                      @pointercancel=${this.onPointerUp}
                    >
                      ${t.pending_count > 0
                        ? html`<span class="pending-badge">待判定×${t.pending_count}</span>`
                        : nothing}
                      <div class="code">${t.turbine_code}</div>
                      <div class="verdict">
                        <span aria-hidden="true">${this.verdictIcon(t)}</span>
                        <span>${this.verdictText(t)}</span>
                      </div>
                      ${t.yaw_err_deg != null
                        ? html`<div class="err">最近误差 ${t.yaw_err_deg}° · #${t.log_id}</div>`
                        : html`<div class="err">尚无办结记录</div>`}
                    </div>
                  `;
                })}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "turbine-wall": TurbineWall;
  }
}
