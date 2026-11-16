// XSEC Frontend API v2 — single-file ESM.  All data comes through the
// manifest-declared broker methods; the iframe has no direct Tauri access.
const DECISIONS = { allowed: ["允许", "success"], denied: ["拒绝", "danger"], manual_review: ["人工审批", "warning"], bypass: ["绕过", "volcano"], error: ["错误", "magenta"] };
const FILTER_DECISIONS = ["allowed", "denied", "manual_review", "bypass", "error"];
const RISKS = { low: "低", medium: "中", high: "高", critical: "严重" };
const MODES = { manual: "人工", auto_llm: "LLM", full_access: "完全访问" };
const WINDOWS = [["all", "全部"], ["24h", "24 小时"], ["7d", "7 天"], ["30d", "30 天"]];
const WINDOW_MS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const MIN_TIMEOUT_MS = 1_000;
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const PAGE_SIZE = 40;
const FILTER_DEBOUNCE_MS = 250;
const FULL_ACCESS_CONFIRMATION = "我确认启用完全访问权限";
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value) { return value === undefined || value === null || value === "" ? "—" : String(value); }
function errorText(error) { return error instanceof Error ? error.message : String(error); }
function logFailure(event, error) { console.error(event, { message: errorText(error) }); }
function sessionIdFrom(context) {
  const id = context?.workspace?.session?.session_id || context?.workspace?.binding?.sessionId;
  return typeof id === "string" && id.trim() ? id : undefined;
}
function formatTime(value) {
  const stamp = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(stamp)) return "—";
  const date = new Date(stamp); const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function decisionInfo(row) {
  const value = row.final_decision || row.decision || "未知";
  return DECISIONS[value] || [value, "neutral"];
}
// The Host pushes colours as --xsec-* variables, not a mode: native controls follow the surface's lightness.
function applyTheme() {
  const probe = element("span"); probe.style.cssText = "position:absolute;visibility:hidden;color:var(--surface)"; document.body.append(probe);
  const channels = getComputedStyle(probe).color.match(/[\d.]+/g) ?? []; probe.remove();
  if (channels.length < 3) return;
  const [red, green, blue] = channels.map(Number);
  document.documentElement.style.colorScheme = red * 0.299 + green * 0.587 + blue * 0.114 < 128 ? "dark" : "light";
}
function icon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("class", "x-icon"); svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path"); shape.setAttribute("d", path); svg.append(shape); return svg;
}
const ICON_REFRESH = "M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3";
const ICON_SEARCH = "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.4-3.4";
const ICON_CLOSE = "M4 4l8 8M12 4l-8 8";
const ICON_INFO = "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.2v4M8 4.8h.01";
const STAT_PARTS = [["允许", "allowed_count", "t-success"], ["拒绝", "denied_count", "t-danger"], ["人工", "manual_review_count", "t-warning"], ["绕过", "bypass_count", "t-neutral"]];
const DETAIL_GROUPS = [["请求", ["请求 ID", "工具", "审批时间", "审批模式", "风险等级"]], ["决定", ["最终决策", "自动审批决定", "决定来源", "自动审批原因", "自动审批指引", "人工最终原因", "命中策略"]], ["命令", ["命令", "工作目录", "参数"]], ["模型", ["审批模型", "置信度", "耗时", "模型失败码"]], ["执行", ["执行状态", "执行错误"]]];
const BASE_CSS = `
:root{--d-canvas:#f7f7f8;--d-surface:#fff;--d-subtle:#f0f0f2;--d-hover:#eaeaed;--d-text:#18181b;--d-muted:#62626b;--d-border:#dcdce1;--d-danger:#b42318;--d-success:#187344;--d-warning:#8a5700}
@media (prefers-color-scheme:dark){:root{--d-canvas:#111113;--d-surface:#19191c;--d-subtle:#232327;--d-hover:#2d2d33;--d-text:#f4f4f5;--d-muted:#a1a1aa;--d-border:#35353c;--d-danger:#ff938a;--d-success:#7ad6a0;--d-warning:#e9bd70}}
:root{--canvas:var(--xsec-window-background,var(--d-canvas));--surface:var(--xsec-content-surface,var(--d-surface));--subtle:var(--xsec-bg-subtle,var(--d-subtle));--hover:var(--xsec-bg-hover,var(--d-hover));--text:var(--xsec-text-primary,var(--d-text));--muted:var(--xsec-text-secondary,var(--d-muted));--border:var(--xsec-border-default,var(--d-border));--primary:var(--xsec-text-accent,var(--d-text));--danger:var(--xsec-status-error,var(--d-danger));--success:var(--xsec-status-success,var(--d-success));--warning:var(--xsec-status-warning,var(--d-warning));--info:color-mix(in srgb,#0169cc 68%,var(--text));--hairline:color-mix(in srgb,var(--text) 10%,transparent);--r-control:var(--xsec-radius-md,8px);--r-panel:var(--xsec-radius-lg,12px);--font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;--mono:ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Liberation Mono",monospace}
*,*::before,*::after{box-sizing:border-box}
html,body,[data-xsec-plugin-root]{width:100%;height:100%;margin:0}
body{overflow:hidden;background:var(--surface);color:var(--text);font:14px/1.45 var(--font);-webkit-font-smoothing:antialiased}
button,input,select{font:inherit;color:inherit}
[hidden]{display:none!important}
:focus-visible{outline:2px solid var(--info);outline-offset:1px}
.x-panel{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;background:var(--surface)}
.x-head{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 12px;border-bottom:1px solid var(--hairline)}
.x-head-copy{display:grid;gap:2px;min-width:0;flex:1}
.x-title{overflow:hidden;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.x-sub{overflow:hidden;color:var(--muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.x-body{display:flex;flex:1;flex-direction:column;gap:12px;min-height:0;padding:12px;overflow:auto}
.x-section{display:grid;gap:8px}
.x-section-title{display:flex;align-items:baseline;gap:8px;margin:0;padding:0 4px;color:var(--muted);font-size:12px;font-weight:600}
.x-count{font-weight:400;font-variant-numeric:tabular-nums}
.x-card{border:1px solid var(--hairline);border-radius:var(--r-panel);background:var(--surface);padding:16px}
.x-card.flush{padding:0;overflow:hidden}
.x-card-title{margin:0 0 8px;font-size:14px;font-weight:600;line-height:32px}
.x-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 12px;width:100%;padding:10px 16px;border:0;border-top:1px solid var(--hairline);background:transparent;text-align:left;cursor:pointer;transition:background-color .12s}
.x-row:first-child{border-top:0}
.x-row:hover{background:var(--subtle)}
.x-row:active{background:var(--hover)}
.x-row:focus-visible{outline-offset:-2px}
.x-row-title{overflow:hidden;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.x-row-meta{display:flex;align-items:center;gap:8px;min-width:0;color:var(--muted);font-size:12px}
.x-row-meta>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.x-badge{display:inline-flex;align-items:center;gap:6px;flex:none;padding:2px 8px;border-radius:999px;background:var(--subtle);color:var(--muted);font-size:12px;font-weight:600;line-height:18px;white-space:nowrap}
.x-badge.success{background:color-mix(in srgb,var(--success) 12%,var(--surface));color:var(--success)}
.x-badge.warning{background:color-mix(in srgb,var(--warning) 14%,var(--surface));color:var(--warning)}
.x-badge.danger{background:color-mix(in srgb,var(--danger) 12%,var(--surface));color:var(--danger)}
.x-badge.info{background:color-mix(in srgb,var(--info) 12%,var(--surface));color:var(--info)}
.x-pulse{width:6px;height:6px;border-radius:50%;background:currentColor;animation:x-pulse 1.6s ease-in-out infinite}
.x-tag{flex:none;padding:1px 6px;border-radius:6px;background:var(--subtle);color:var(--muted);font:12px/18px var(--mono)}
.x-kv{display:grid;grid-template-columns:minmax(88px,max-content) minmax(0,1fr);gap:8px 16px;margin:0}
.x-kv dt{color:var(--muted)}
.x-kv dd{min-width:0;margin:0;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}
.x-kv dd.mono,.x-mono{font-family:var(--mono);font-size:13px}
.x-notice{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border:1px solid color-mix(in srgb,var(--tone) 32%,transparent);border-radius:var(--r-control);background:color-mix(in srgb,var(--tone) 8%,var(--surface));--tone:var(--info)}
.x-notice.danger{--tone:var(--danger)}
.x-notice.warning{--tone:var(--warning)}
.x-notice svg{flex:none;margin-top:2px;color:var(--tone)}
.x-notice-text{flex:1;min-width:0;overflow-wrap:anywhere}
.x-notice .x-btn{margin:-3px -6px -3px 0}
.x-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:32px;padding:0 12px;border:0;border-radius:var(--r-control);background:var(--subtle);font-weight:500;white-space:nowrap;cursor:pointer;transition:background-color .12s}
.x-btn:hover{background:var(--hover)}
.x-btn:disabled{opacity:.5;cursor:default;pointer-events:none}
.x-btn.small{height:26px;padding:0 8px;font-size:12px}
.x-btn.ghost{background:transparent}
.x-btn.ghost:hover{background:var(--subtle)}
.x-btn.primary{background:var(--primary);color:var(--surface)}
.x-btn.primary:hover{background:color-mix(in srgb,var(--primary) 88%,var(--surface))}
.x-icon{flex:none;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.x-empty{display:grid;flex:1;place-content:center;justify-items:center;gap:4px;padding:32px 24px;text-align:center}
.x-empty strong{font-weight:600}
.x-empty span{max-width:320px;color:var(--muted);font-size:13px}
.x-spinner{width:20px;height:20px;margin-bottom:8px;border:2px solid var(--hairline);border-top-color:var(--muted);border-radius:50%;animation:x-spin .8s linear infinite}
.x-num{font-variant-numeric:tabular-nums}
@keyframes x-spin{to{transform:rotate(360deg)}}
@keyframes x-pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.x-pulse,.x-spinner{animation:none}.x-row,.x-btn{transition:none}}
.x-input,.x-select{height:32px;min-width:0;padding:0 10px;border:1px solid transparent;border-radius:var(--r-control);background:var(--subtle);outline:0;transition:border-color .12s,background-color .12s}
.x-input::placeholder{color:var(--muted);opacity:.8}
.x-input:hover,.x-select:hover{background:var(--hover)}
.x-input:focus-visible,.x-select:focus-visible{border-color:var(--info);background:var(--surface);outline:2px solid color-mix(in srgb,var(--info) 30%,transparent);outline-offset:0}
.x-input:disabled,.x-select:disabled{opacity:.5}
.x-select{padding-right:28px;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8a93' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:16px;cursor:pointer}
.x-seg{display:inline-flex;flex:none;gap:2px;padding:2px;border-radius:var(--r-control);background:var(--subtle)}
.x-seg button{height:28px;padding:0 10px;border:0;border-radius:calc(var(--r-control) - 2px);background:transparent;color:var(--muted);font-weight:500;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}
.x-seg button:hover{color:var(--text)}
.x-seg button[aria-pressed=true]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--hairline),0 1px 2px color-mix(in srgb,#000 8%,transparent)}
.x-field{display:grid;gap:6px}
.x-label{font-weight:500}
.x-check{display:flex;align-items:flex-start;gap:8px;cursor:pointer}
.x-check input{flex:none;width:16px;height:16px;margin:2.5px 0 0;accent-color:var(--primary);cursor:pointer}
.x-inset{display:grid;gap:12px;padding:12px;border-radius:var(--r-control);background:var(--subtle)}
`;
const VIEW_CSS = `
.ap-summary{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px 24px;padding:12px 16px}
.ap-rate{display:grid;gap:2px}
.ap-rate strong{font-size:24px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ap-rate span{color:var(--muted);font-size:12px}
.ap-mix{display:grid;gap:8px;min-width:0}
.ap-bar{display:flex;gap:2px;height:8px;border-radius:999px;background:var(--subtle);overflow:hidden}
.ap-bar span{min-width:3px;background:var(--tone)}
.ap-legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;padding:0;list-style:none;color:var(--muted);font-size:12px}
.ap-legend li{display:flex;align-items:center;gap:6px;white-space:nowrap}
.ap-legend i{width:8px;height:8px;border-radius:2px;background:var(--tone)}
.ap-legend b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.t-success{--tone:var(--success)}.t-danger{--tone:var(--danger)}.t-warning{--tone:var(--warning)}.t-neutral{--tone:color-mix(in srgb,var(--muted) 55%,var(--surface))}
.ap-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ap-search{position:relative;display:flex;flex:0 1 240px;min-width:140px}
.ap-search .x-icon{position:absolute;top:8px;left:9px;color:var(--muted);pointer-events:none}
.ap-search .x-input{width:100%;padding-left:30px}
.ap-list:empty{display:none}
.ap-row{grid-template-columns:minmax(0,1fr) auto;padding:8px 16px}
.ap-row-main{display:flex;align-items:center;gap:8px;min-width:0}
.ap-risk{flex:none;color:var(--muted);font-size:12px;white-space:nowrap}
.ap-risk[data-risk=medium]{color:var(--warning)}
.ap-risk[data-risk=high],.ap-risk[data-risk=critical]{color:var(--danger);font-weight:600}
.ap-preview{overflow:hidden;color:var(--muted);font:12px/18px var(--mono);text-overflow:ellipsis;white-space:nowrap}
.ap-preview.plain{font-family:inherit}
.ap-time{justify-self:end;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ap-row .x-badge{justify-self:end}
.x-badge.volcano{background:color-mix(in srgb,var(--warning) 14%,var(--surface));color:var(--warning)}
.x-badge.magenta{background:color-mix(in srgb,var(--danger) 12%,var(--surface));color:var(--danger)}
.ap-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px;border-top:1px solid var(--hairline)}
.ap-status{flex:1 1 0;min-width:0;margin:0;overflow:hidden;color:var(--muted);font-size:12px;text-align:right;text-overflow:ellipsis;white-space:nowrap}
.ap-status[data-tone=error]{flex-basis:100%;padding:8px 12px;text-align:left;border:1px solid color-mix(in srgb,var(--danger) 32%,transparent);border-radius:var(--r-control);background:color-mix(in srgb,var(--danger) 8%,var(--surface));color:var(--text);font-size:14px;white-space:normal;overflow-wrap:anywhere}
.ap-page{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.ap-drawer{position:fixed;inset:0;z-index:10;display:flex;justify-content:flex-end;background:color-mix(in srgb,#000 28%,transparent)}
.ap-drawer-panel{display:flex;flex-direction:column;width:min(560px,100%);height:100%;border-left:1px solid var(--hairline);background:var(--surface);box-shadow:-8px 0 24px color-mix(in srgb,#000 16%,transparent);animation:ap-slide .2s ease-out}
.ap-drawer-head{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 12px 8px 16px;border-bottom:1px solid var(--hairline)}
.ap-drawer-head h2{flex:1;min-width:0;margin:0;overflow:hidden;font-size:16px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.ap-drawer-body{display:grid;align-content:start;gap:16px;min-height:0;padding:16px;overflow:auto}
.ap-drawer-body>.ap-status{white-space:normal;text-align:left}
.ap-group{display:grid;gap:8px}
.ap-group+.ap-group{padding-top:16px;border-top:1px solid var(--hairline)}
.ap-group h3{margin:0;color:var(--muted);font-size:12px;font-weight:600}
.x-kv{align-items:baseline}
.x-kv>div{display:contents}
.x-kv dd.approval-code{width:fit-content;max-width:100%;padding:4px 8px;border-radius:6px;background:var(--subtle);font:12px/1.5 var(--mono);white-space:pre-wrap}
.approval-settings{height:100%;overflow:auto}
.ap-page-inner{display:grid;gap:16px;max-width:760px;margin:0 auto;padding:24px 24px 0}
.ap-page-head{display:flex;align-items:center;gap:8px}
.ap-page-head h1{margin:0;font-size:20px;font-weight:600;line-height:1.3}
.ap-hint{display:inline-grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:help}
.ap-hint:hover,.ap-hint:focus-visible{background:var(--subtle);color:var(--text)}
.ap-hint-text{color:var(--muted);font-size:13px;margin:-8px 0 0}
.ap-form{display:grid;gap:12px}
.ap-form p{margin:0;color:var(--muted);font-size:13px}
.approval-model-status{display:flex;align-items:center;gap:8px;margin:0;color:var(--muted);font-size:12px}
.approval-model-status::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 16px}
.ap-actions{position:sticky;bottom:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px;padding:12px max(24px,calc((100% - 712px) / 2));border-top:1px solid var(--hairline);background:var(--surface)}
.ap-actions .ap-status{white-space:normal;text-align:left}
.x-inset .x-input{background:var(--surface)}
.ap-actions .ap-status:empty{visibility:hidden}
@keyframes ap-slide{from{transform:translateX(24px);opacity:0}}
@media (max-width:520px){.ap-summary{grid-template-columns:1fr}.ap-page-inner{padding:16px 16px 0}.ap-actions{padding:12px 16px}.ap-status{flex-basis:100%;text-align:left}}
@media (prefers-reduced-motion:reduce){.ap-drawer-panel{animation:none}}
`;
function isNumericSetting(value) { return typeof value === "number" && Number.isFinite(value); }
function validLlm(llm) { return isRecord(llm) && typeof llm.use_default_model === "boolean" && (llm.use_default_model || typeof llm.model === "string") && isNumericSetting(llm.timeout_ms) && Number.isSafeInteger(llm.timeout_ms) && llm.timeout_ms >= MIN_TIMEOUT_MS; }
function validSettings(settings) {
  const threshold = Number(settings?.low_confidence_threshold);
  return isRecord(settings) && validLlm(settings.llm)
    && typeof settings.auto_enabled === "boolean" && typeof settings.full_access === "boolean" && typeof settings.allow_local_readonly === "boolean"
    && isNumericSetting(settings.low_confidence_threshold) && threshold >= MIN_CONFIDENCE && threshold <= MAX_CONFIDENCE;
}
function applySettings(controls, settings) {
  if (!validSettings(settings)) throw new Error("审批设置响应无效");
  controls.auto.checked = settings.auto_enabled; controls.full.checked = settings.full_access; controls.risk.hidden = !settings.full_access;
  controls.acknowledge.checked = false; controls.confirm.value = ""; controls.readonly.checked = settings.allow_local_readonly;
  controls.threshold.value = String(settings.low_confidence_threshold); controls.model.value = settings.llm.use_default_model ? "" : settings.llm.model;
  controls.timeout.value = String(settings.llm.timeout_ms);
}
function showResolvedModel(controls, settings) {
  const value = settings?.resolved_model;
  controls.modelStatus.textContent = value?.error ? `模型状态：${value.error}` : value?.model
    ? `模型状态：${value.provider || "默认服务商"} / ${value.model}（${value.api_key_available ? "凭据可用" : "凭据不可用"}）`
    : `模型状态：${settings?.api_key_configured ? "使用当前会话模型" : "尚未配置固定审批模型"}`;
}
function showSettingsOverview(controls, settings) {
  const model = settings?.llm?.use_default_model ? "跟随当前会话模型" : (settings?.llm?.model || "未配置");
  const values = [["新会话默认模式", settings?.auto_enabled ? "LLM 自动审批" : "人工审批"], ["完全访问授权", settings?.full_access ? "已授权，可显式选择" : "未授权"], ["审批模型策略", model]];
  controls.summary.replaceChildren(); for (const [label, value] of values) controls.summary.append(detailValue(label, value));
}
function settingsContextKey(context) {
  const settings = isRecord(context?.settings) ? context.settings : {};
  return JSON.stringify([context?.kind, settings.id, settings.page]);
}
function addStyles(root) {
  const style = element("style"); style.textContent = BASE_CSS + VIEW_CSS; root.append(style);
}
function detailValue(label, value, code = false) {
  const item = element("div"); const title = element("dt", "", label); const body = element("dd", code ? "approval-code" : "", text(value));
  item.append(title, body); return item;
}
function policyValue(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.join("、") : value; } catch { return value; }
}
function confidence(value) { return value == null ? undefined : `${(Number(value) * 100).toFixed(1)}%`; }
function latency(value) { return value == null ? undefined : `${value} ms`; }
function detailContent(row) {
  const [label, tone] = decisionInfo(row);
  const items = [["请求 ID", row.request_id, true], ["工具", row.tool_name], ["最终决策", label], ["自动审批决定", row.gateway_decision ? (DECISIONS[row.gateway_decision]?.[0] || row.gateway_decision) : undefined], ["决定来源", row.resolution_source], ["风险等级", row.risk_level ? (RISKS[row.risk_level] || row.risk_level) : undefined], ["审批模式", MODES[row.mode] || row.mode], ["命令", row.command_preview, true], ["工作目录", row.cwd, true], ["参数", row.arguments_preview, true], ["自动审批原因", row.gateway_reason || row.reason], ["自动审批指引", row.gateway_guidance || row.agent_guidance], ["人工最终原因", row.final_reason], ["模型失败码", row.llm_failure_code], ["命中策略", row.policy_codes_json ? policyValue(row.policy_codes_json) : undefined], ["审批模型", row.model_name], ["置信度", confidence(row.model_confidence)], ["耗时", latency(row.model_latency_ms)], ["执行状态", row.execution_status], ["执行错误", row.execution_error], ["审批时间", row.approval_started_at == null ? undefined : formatTime(row.approval_started_at)]];
  return { label, tone, items: items.filter(([, value]) => value !== undefined && value !== null && value !== "") };
}
function renderDetail(row) {
  const { label, tone, items } = detailContent(row); const details = element("div", "ap-drawer-body"); const placed = new Set();
  const group = (title, entries) => {
    if (!entries.length) return;
    const section = element("section", "ap-group"); const list = element("dl", "x-kv");
    for (const [name, value, code] of entries) list.append(detailValue(name, value, code));
    section.append(element("h3", "", title), list); details.append(section);
  };
  for (const [title, names] of DETAIL_GROUPS) { const entries = items.filter(([name]) => names.includes(name)); entries.forEach(([name]) => placed.add(name)); group(title, entries); }
  group("其他", items.filter(([name]) => !placed.has(name)));
  const decision = element("span", `x-badge ${tone}`, label); return { decision, details };
}
function validSummary(row, session) {
  return isRecord(row) && row.session_id === session && typeof row.request_id === "string" && Boolean(row.request_id) && typeof row.id === "string" && Boolean(row.id) && Number.isSafeInteger(row.created_at);
}
export function validatePage(page, session) {
  if (!isRecord(page) || !Array.isArray(page.rows) || page.rows.some((row) => !validSummary(row, session))) throw new Error("审批列表分页数据无效");
  const cursor = page.nextCursor; const last = page.rows.at(-1);
  if (cursor !== null) validateCursor(cursor, last);
  return page;
}
function validateCursor(cursor, last) {
  if (!isRecord(cursor) || !Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0 || !last || cursor.id !== last.id || cursor.createdAt !== last.created_at) throw new Error("审批列表分页游标无效");
}
function validateRevision(value, revision) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value) || (revision && value !== revision)) throw new Error("审批详情分片版本无效");
}
export function validateChunk(chunk, offset, revision) {
  if (!isRecord(chunk) || typeof chunk.data !== "string" || !chunk.data) throw new Error("审批详情分片数据无效");
  validateRevision(chunk.revision, revision); const end = offset + new TextEncoder().encode(chunk.data).length;
  if (chunk.nextOffset !== null && (!Number.isSafeInteger(chunk.nextOffset) || chunk.nextOffset !== end)) throw new Error("审批详情分片位置无效");
  return chunk;
}
function validThreshold(value) { return Boolean(value) && Number.isFinite(Number(value)) && Number(value) >= MIN_CONFIDENCE && Number(value) <= MAX_CONFIDENCE; }
function validTimeout(value) { return Boolean(value) && Number.isSafeInteger(Number(value)) && Number(value) >= MIN_TIMEOUT_MS; }
class SettingsPage {
  constructor(api) { this.api = api; this.settingsReady = false; this.loadRevision = 0; this.contextKey = settingsContextKey(api.context); this.disposed = false; this.lifecycleRevision = 0; }
  notice(message, failed = false) { this.controls.notice.textContent = message; this.controls.notice.dataset.tone = failed ? "error" : ""; }
  async readSettings() {
    try { return await this.api.readSettings(); }
    catch (error) { logFailure("approvals.settings.load.failed", error); throw error; }
  }
  async writeSettings(input) {
    try { return await this.api.writeSettings(input); }
    catch (error) { logFailure("approvals.settings.save.failed", error); throw error; }
  }
  async load() {
    if (this.activeSave) { this.activeSave.reloadQueued = true; this.controls.retry.disabled = true; return; }
    const revision = ++this.loadRevision;
    this.settingsReady = false; this.controls.save.disabled = true; this.controls.retry.disabled = true; this.notice("正在读取审批设置…");
    console.info("approvals.settings.load.started");
    try {
      const settings = await this.readSettings();
      if (revision !== this.loadRevision) return;
      applySettings(this.controls, settings);
      showResolvedModel(this.controls, settings); showSettingsOverview(this.controls, settings); this.settingsReady = true; this.controls.save.disabled = false; this.notice("");
      console.info("approvals.settings.load.completed", { fullAccessEnabled: settings.full_access, usesDefaultModel: settings.llm.use_default_model });
    } catch (error) { if (revision === this.loadRevision) this.notice(`读取审批设置失败：${errorText(error)}`, true); } finally { if (revision === this.loadRevision) this.controls.retry.disabled = false; }
  }
  saveInput() {
    const controls = this.controls; const fullAccess = controls.full.checked; const acknowledged = fullAccess && controls.confirm.value === FULL_ACCESS_CONFIRMATION;
    const threshold = controls.threshold.value.trim(); const timeout = controls.timeout.value.trim();
    if (!validThreshold(threshold)) throw new Error("低置信度阈值必须是 0 到 1 之间的数字。");
    if (!validTimeout(timeout)) throw new Error("模型超时必须是不小于 1000 毫秒的安全整数。");
    if (fullAccess && (!acknowledged || !controls.acknowledge.checked)) throw new Error("启用完全访问前，请确认风险声明并输入确认语句。");
    return { autoEnabled: controls.auto.checked, fullAccess, allowLocalReadonly: controls.readonly.checked, lowConfidenceThreshold: Number(threshold), llm: { model: controls.model.value.trim(), timeoutMs: Number(timeout), temperature: 0 }, fullAccessAcknowledged: acknowledged };
  }
  isActiveSave(save) { return this.activeSave === save && save.revision === this.loadRevision && !this.disposed && save.lifecycle === this.lifecycleRevision; }
  finishSave(save) {
    if (this.activeSave !== save) return;
    this.activeSave = undefined;
    if (save.reloadQueued && !this.disposed) void this.load();
    else if (!this.disposed && save.lifecycle === this.lifecycleRevision && save.revision === this.loadRevision) { this.controls.save.disabled = !this.settingsReady; this.controls.retry.disabled = false; }
  }
  async save() {
    if (!this.settingsReady) return this.notice("请先成功读取当前审批设置后再保存。", true);
    let input; try { input = this.saveInput(); } catch (error) { this.notice(errorText(error), true); return; }
    this.controls.save.disabled = true; this.controls.retry.disabled = true;
    const saveState = { lifecycle: this.lifecycleRevision, reloadQueued: false, revision: ++this.loadRevision }; this.activeSave = saveState; console.info("approvals.settings.save.started", { fullAccessEnabled: input.fullAccess });
    try {
      const settings = await this.writeSettings(input); if (!this.isActiveSave(saveState)) return;
      applySettings(this.controls, settings); showResolvedModel(this.controls, settings); showSettingsOverview(this.controls, settings); this.settingsReady = true;
      this.notice("已保存。审批授权和只读放行立即生效；新会话默认策略仅影响之后创建的会话。"); console.info("approvals.settings.save.completed", { fullAccessEnabled: settings.full_access, usesDefaultModel: settings.llm.use_default_model });
    } catch (error) { if (this.isActiveSave(saveState)) this.notice(`保存审批设置失败：${errorText(error)}`, true); } finally { this.finishSave(saveState); }
  }
  field(title, input) { const label = element("label", "x-field"); label.append(element("span", "x-label", title), input); return label; }
  build() {
    this.root.replaceChildren(); addStyles(this.root); const page = element("main", "approval-settings"); const inner = element("div", "ap-page-inner");
    const auto = element("input"); auto.type = "checkbox"; const full = element("input"); full.type = "checkbox"; const readonly = element("input"); readonly.type = "checkbox"; const acknowledge = element("input"); acknowledge.type = "checkbox";
    const threshold = element("input", "x-input"); threshold.type = "number"; threshold.min = "0"; threshold.max = "1"; threshold.step = "0.05";
    const model = element("input", "x-input"); model.placeholder = "留空使用当前会话模型"; const timeout = element("input", "x-input"); timeout.type = "number"; timeout.min = "1000"; timeout.step = "1000";
    const confirm = element("input", "x-input"); confirm.placeholder = `启用完全访问时输入：${FULL_ACCESS_CONFIRMATION}`;
    const card = (title, ...children) => { const node = element("section", "x-card"); const body = element("div", "ap-form"); body.append(...children); node.append(element("h2", "x-card-title", title), body); return node; };
    const summary = element("dl", "x-kv"); const summaryCard = card("审批策略", summary);
    const saveButton = element("button", "x-btn primary", "保存设置"); const retryButton = element("button", "x-btn ghost", "重新读取设置"); saveButton.type = "button"; retryButton.type = "button"; retryButton.prepend(icon(ICON_REFRESH));
    const status = element("p", "approval-model-status"); const note = element("p", "ap-status"); note.setAttribute("role", "status"); saveButton.disabled = true;
    const check = (input, label) => { const node = element("label", "x-check"); node.append(input, element("span", "", label)); return node; };
    const risk = element("section", "x-inset"); const riskTitle = element("strong", "", "完全访问确认"); const riskDetail = element("p", "", "启用后，普通会话、批量任务和资产发现可以显式选择完全访问。系统危险规则、工作区写入沙箱和审计仍然生效。请仅在目标与操作均已获得授权时继续。");
    risk.append(riskTitle, riskDetail, check(acknowledge, "我已了解上述风险，并确认当前操作仅用于合法且已获得授权的目标。"), this.field("请输入确认语句", confirm)); risk.hidden = true;
    const updateRisk = () => { risk.hidden = !full.checked; if (!full.checked) { acknowledge.checked = false; confirm.value = ""; } };
    saveButton.onclick = () => void this.save(); retryButton.onclick = () => void this.load();
    full.onchange = updateRisk;
    const explanation = "新会话默认策略影响后续创建的普通会话；完全访问是全局可选上限，当前会话的模式仍在任务界面管理。";
    const head = element("header", "ap-page-head"); const hint = element("button", "ap-hint"); hint.type = "button"; hint.title = explanation; hint.setAttribute("aria-label", explanation); hint.append(icon(ICON_INFO)); head.append(element("h1", "", "审批记录"), hint);
    const numbers = element("div", "ap-grid"); numbers.append(this.field("低置信度阈值", threshold), this.field("模型超时（毫秒）", timeout));
    const actions = element("footer", "ap-actions"); actions.append(note, retryButton, saveButton);
    inner.append(head, summaryCard, card("默认策略", check(auto, "新会话默认使用 LLM 自动审批"), check(readonly, "本地只读调用直接放行"), check(full, "允许选择完全访问（高风险）"), risk), card("审批模型", this.field("审批模型（留空跟随当前会话模型）", model), status, numbers));
    page.append(inner, actions);
    this.root.append(page); this.controls = { auto, full, readonly, threshold, model, timeout, confirm, acknowledge, risk, summary, save: saveButton, retry: retryButton, modelStatus: status, notice: note }; updateRisk(); retryButton.disabled = Boolean(this.activeSave); console.info("approvals.settings.mount"); if (this.activeSave) this.activeSave.reloadQueued = true; else void this.load();
  }
  mount(root, context) { this.themeSubscription?.dispose(); this.disposed = false; this.lifecycleRevision += 1; this.root = root; this.contextKey = settingsContextKey(context); this.build(); applyTheme({}); this.themeSubscription = this.api.onTheme((theme) => applyTheme(theme)); }
  update(context) { const key = settingsContextKey(context); if (key === this.contextKey) return; this.contextKey = key; if (this.activeSave?.lifecycle === this.lifecycleRevision) { this.activeSave.reloadQueued = true; return; } return this.load(); }
  dispose() { console.debug("approvals.settings.dispose"); this.disposed = true; this.lifecycleRevision += 1; if (this.activeSave) this.activeSave.reloadQueued = false; this.themeSubscription?.dispose(); }
}
class WorkspacePage {
  constructor(api) {
    this.api = api; this.context = api.context;
    this.state = { session: undefined, revision: 0, rows: undefined, stats: undefined, autoRefresh: false, detailRequestId: undefined, detailRevision: 0, cursors: [null], pageIndex: 0, nextCursor: null, sinceMs: undefined, refreshInFlight: false, disposed: false, tool: "", decision: "", window: "all" };
  }
  status(message, failed = false) { this.controls.status.textContent = message; this.controls.status.dataset.tone = failed ? "error" : ""; }
  showStats() {
    const { controls, state } = this; controls.summary.replaceChildren(); const stats = state.stats; const rate = stats ? `${(Number(stats.allow_rate) * 100).toFixed(1)}%` : "—";
    const block = element("div", "ap-rate"); block.append(element("strong", "", rate), element("span", "", "放行率"));
    const mix = element("div", "ap-mix"); const bar = element("div", "ap-bar"); bar.setAttribute("aria-hidden", "true"); const legend = element("ul", "ap-legend");
    const total = element("li"); total.append(document.createTextNode("总数"), element("b", "", text(stats ? stats.approval_request_count : undefined))); legend.append(total);
    for (const [label, key, tone] of STAT_PARTS) {
      const count = stats ? stats[key] : undefined; const item = element("li", tone); item.append(element("i"), document.createTextNode(label), element("b", "", text(count))); legend.append(item);
      if (count > 0) { const part = element("span", tone); part.style.flexGrow = String(count); bar.append(part); }
    }
    mix.append(bar, legend); controls.summary.append(block, mix);
  }
  closeDetail() { this.state.detailRequestId = undefined; this.state.detailRevision += 1; this.controls.drawer.hidden = true; this.controls.drawer.replaceChildren(); }
  drawerPanel(...extra) {
    const panel = element("section", "ap-drawer-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "本会话审批详情"); const head = element("header", "ap-drawer-head");
    const close = element("button", "x-btn ghost small"); close.type = "button"; close.setAttribute("aria-label", "关闭"); close.title = "关闭"; close.append(icon(ICON_CLOSE)); close.onclick = () => this.closeDetail();
    head.append(element("h2", "", "本会话审批详情"), ...extra, close); panel.append(head); panel.onkeydown = (event) => { if (event.key === "Escape") this.closeDetail(); };
    return { panel, close };
  }
  showDetail(row) {
    const view = renderDetail(row); const { panel, close } = this.drawerPanel(view.decision);
    panel.append(view.details); this.controls.drawer.replaceChildren(panel); this.controls.drawer.hidden = false; close.focus();
  }
  currentDetail(revision) { return revision === this.state.detailRevision && !this.state.disposed; }
  async openDetail(row) {
    const { state, controls, api } = this; this.closeDetail(); const revision = state.detailRevision; const session = state.session; state.detailRequestId = row.request_id;
    const { panel, close } = this.drawerPanel(); const body = element("div", "ap-drawer-body");
    const note = element("p", "ap-status", "正在加载审批详情…"); body.append(note); panel.append(body); controls.drawer.replaceChildren(panel); controls.drawer.hidden = false; close.focus();
    console.info("approvals.workspace.detail.started");
    try {
      let offset = 0; let version; let serialized = "";
      do {
        const chunk = validateChunk(await api.detail({ requestId: row.request_id, offset, revision: version }), offset, version);
        if (!this.currentDetail(revision)) return;
        serialized += chunk.data; version = chunk.revision; offset = chunk.nextOffset;
      } while (offset !== null);
      const detail = JSON.parse(serialized);
      if (!isRecord(detail) || detail.session_id !== session || detail.request_id !== row.request_id || detail.id !== row.id) throw new Error("审批详情会话归属无效");
      this.showDetail(detail); console.info("approvals.workspace.detail.completed");
    } catch (error) {
      if (!this.currentDetail(revision)) return;
      logFailure("approvals.workspace.detail.failed", error); note.textContent = `加载审批详情失败：${errorText(error)}`; note.dataset.tone = "error";
    }
  }
  showRows() {
    const { controls, state } = this; controls.list.replaceChildren(); const rows = state.rows; controls.empty.hidden = Boolean(rows?.length); controls.empty.firstChild.textContent = rows ? "本会话暂无审批记录" : "尚未加载审批记录";
    if (!rows?.length) return;
    for (const row of rows) {
      const [label, tone] = decisionInfo(row); const card = element("button", "x-row ap-row"); card.type = "button"; card.setAttribute("aria-label", `查看 ${text(row.tool_name)} 的审批详情`);
      const head = element("span", "ap-row-main"); head.append(element("strong", "x-row-title", text(row.tool_name)));
      if (row.mode) head.append(element("span", "x-tag", MODES[row.mode] || row.mode));
      if (row.risk_level) { const risk = element("span", "ap-risk", `风险 ${RISKS[row.risk_level] || row.risk_level}`); risk.dataset.risk = row.risk_level; head.append(risk); }
      const preview = element("span", row.command_preview ? "ap-preview" : "ap-preview plain", text(row.command_preview || row.reason || "无补充说明"));
      card.append(head, element("span", `x-badge ${tone}`, label), preview, element("span", "ap-time", formatTime(row.created_at))); card.onclick = () => void this.openDetail(row); controls.list.append(card);
    }
  }
  showPagination() { const { controls, state } = this; controls.previous.disabled = state.refreshInFlight || state.pageIndex === 0; controls.next.disabled = state.refreshInFlight || !state.nextCursor; controls.page.textContent = `第 ${state.pageIndex + 1} 页`; }
  render() { this.showStats(); this.showRows(); this.showPagination(); }
  resetPages() {
    const { state } = this; state.revision += 1; state.autoRefresh = false; state.refreshInFlight = false; this.controls.refresh.disabled = false;
    state.cursors = [null]; state.pageIndex = 0; state.nextCursor = null; state.sinceMs = state.window === "all" ? undefined : Date.now() - WINDOW_MS[state.window]; state.rows = undefined; state.stats = undefined; this.closeDetail(); this.render();
  }
  resetSession(session) { window.clearTimeout(this.debounce); this.state.session = session; this.resetPages(); }
  current(revision) { return revision === this.state.revision && !this.state.disposed; }
  targetPage(options) { const pageIndex = options.pageIndex ?? this.state.pageIndex; const cursors = options.cursors ?? this.state.cursors; return { pageIndex, cursors, cursor: cursors[pageIndex] }; }
  readPage(cursor) { const { state, api } = this; return Promise.all([api.list({ decision: state.decision || undefined, toolName: state.tool || undefined, sinceMs: state.sinceMs, limit: PAGE_SIZE, ...(cursor ? { beforeCreatedAt: cursor.createdAt, beforeId: cursor.id } : {}) }), api.statistics(state.window === "all" ? {} : { window: state.window })]); }
  async refresh(options = {}) {
    const { state, controls } = this; const silent = options.silent === true; const session = sessionIdFrom(this.context);
    if (!session) { this.resetSession(undefined); this.status("进入会话后查看该会话的审批记录。"); return; }
    if (session !== state.session) this.resetSession(session);
    const { pageIndex, cursors, cursor } = this.targetPage(options);
    const revision = ++state.revision; state.refreshInFlight = true; controls.refresh.disabled = true; this.showPagination();
    if (!silent) { this.closeDetail(); this.status("正在加载本会话审批记录…"); }
    try {
      const [list, stats] = await this.readPage(cursor);
      if (!this.current(revision)) return;
      const result = validatePage(list, session); validateStatistics(stats); state.rows = result.rows; state.stats = stats; state.nextCursor = result.nextCursor;
      state.pageIndex = pageIndex; state.cursors = cursors; state.autoRefresh = true; this.render(); this.status("");
      if (!silent) console.info("approvals.workspace.page.loaded", { page: pageIndex + 1, count: result.rows.length, hasNext: Boolean(result.nextCursor) });
    } catch (error) {
      if (!this.current(revision)) return;
      state.rows = undefined; state.stats = undefined; state.nextCursor = null; state.autoRefresh = false; this.closeDetail(); this.render();
      logFailure("approvals.workspace.refresh.failed", error); this.status(`加载本会话审批记录失败：${errorText(error)}`, true);
    } finally { if (this.current(revision)) { state.refreshInFlight = false; controls.refresh.disabled = false; this.showPagination(); } }
  }
  pagination() {
    const bar = element("nav", "ap-foot"); bar.setAttribute("aria-label", "审批记录分页");
    const previous = element("button", "x-btn small", "上一页"); const next = element("button", "x-btn small", "下一页"); const page = element("span", "ap-page"); previous.type = "button"; next.type = "button";
    previous.onclick = () => void this.refresh({ pageIndex: this.state.pageIndex - 1 });
    next.onclick = () => void this.refresh({ pageIndex: this.state.pageIndex + 1, cursors: [...this.state.cursors.slice(0, this.state.pageIndex + 1), this.state.nextCursor] });
    bar.append(page, previous, next); return { bar, previous, page, next };
  }
  later() { window.clearTimeout(this.debounce); this.debounce = window.setTimeout(() => { console.info("approvals.workspace.tool-filter.applied", { hasValue: Boolean(this.state.tool) }); void this.refresh(); }, FILTER_DEBOUNCE_MS); }
  build() {
    const { root, state } = this; root.replaceChildren(); addStyles(root); const page = element("section", "x-panel xsec-approvals"); page.setAttribute("aria-label", "审批记录");
    const head = element("header", "x-head"); const copy = element("span", "x-head-copy"); copy.append(element("h1", "x-title", "本会话审批记录")); copy.firstChild.style.margin = "0";
    const refreshButton = element("button", "x-btn ghost small", "刷新"); refreshButton.type = "button"; refreshButton.prepend(icon(ICON_REFRESH)); refreshButton.onclick = () => { console.info("approvals.workspace.refresh.requested"); this.resetPages(); void this.refresh(); }; head.append(copy, refreshButton);
    const body = element("div", "x-body"); const summary = element("section", "x-card ap-summary"); summary.setAttribute("aria-label", "审批统计");
    const toolbar = element("div", "ap-toolbar"); const windowGroup = element("span", "x-seg"); windowGroup.setAttribute("role", "group"); windowGroup.setAttribute("aria-label", "时间窗口"); const select = element("select", "x-select"); select.setAttribute("aria-label", "决策筛选"); const input = element("input", "x-input"); input.placeholder = "工具名"; input.type = "search"; input.setAttribute("aria-label", "工具名"); [["", "全部决策"], ...FILTER_DECISIONS.map((key) => [key, DECISIONS[key][0]])].forEach(([value, label]) => { const option = element("option", "", label); option.value = value; select.append(option); });
    for (const [value, label] of WINDOWS) { const button = element("button", "", label); button.type = "button"; button.dataset.value = value; button.onclick = () => { if (state.window !== value) { console.info("approvals.workspace.window.changed", { window: value }); state.window = value; this.resetPages(); this.updateWindows(); void this.refresh(); } }; windowGroup.append(button); }
    const search = element("label", "ap-search"); search.append(icon(ICON_SEARCH), input);
    select.value = state.decision; input.value = state.tool; select.onchange = () => { console.info("approvals.workspace.decision.changed", { decision: select.value || "all" }); state.decision = select.value; this.resetPages(); void this.refresh(); }; input.oninput = () => { state.tool = input.value.trim(); this.resetPages(); this.later(); }; toolbar.append(windowGroup, select, search);
    const stateText = element("p", "ap-status"); stateText.setAttribute("role", "status"); const list = element("div", "x-card flush ap-list"); const empty = element("div", "x-empty"); empty.append(element("strong", "", ""));
    const drawer = element("aside", "ap-drawer"); drawer.hidden = true; drawer.onclick = (event) => { if (event.target === drawer) this.closeDetail(); }; const pager = this.pagination(); toolbar.append(stateText);
    body.append(summary, toolbar, list, empty); page.append(head, body, pager.bar, drawer); root.append(page); this.controls = { ...pager, summary, list, empty, status: stateText, refresh: refreshButton, drawer, windows: windowGroup.querySelectorAll("button") }; this.updateWindows(); this.render(); console.info("approvals.workspace.mount");
  }
  updateWindows() { this.controls.windows.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === this.state.window))); }
  mount(root, context) {
    window.clearInterval(this.timer); window.clearTimeout(this.debounce); this.themeSubscription?.dispose(); this.state.disposed = false; this.state.revision += 1; this.state.detailRevision += 1; this.state.detailRequestId = undefined;
    this.root = root; this.context = context; this.build(); applyTheme({}); this.themeSubscription = this.api.onTheme((theme) => applyTheme(theme));
    this.timer = window.setInterval(() => { const state = this.state; if (state.autoRefresh && state.pageIndex === 0 && !state.detailRequestId && !state.refreshInFlight && document.visibilityState === "visible") void this.refresh({ silent: true }); }, AUTO_REFRESH_INTERVAL_MS); return this.refresh();
  }
  update(context) { this.context = context; if (sessionIdFrom(context) !== this.state.session) { console.debug("approvals.workspace.context.changed"); return this.refresh(); } }
  dispose() { console.debug("approvals.workspace.dispose"); this.state.disposed = true; this.state.revision += 1; this.closeDetail(); window.clearInterval(this.timer); window.clearTimeout(this.debounce); this.themeSubscription?.dispose(); }
}
export function validateStatistics(stats) {
  const counts = ["approval_request_count", "allowed_count", "denied_count", "manual_review_count", "bypass_count"];
  if (!isRecord(stats) || counts.some((key) => !Number.isSafeInteger(stats[key]) || stats[key] < 0) || !Number.isFinite(stats.allow_rate) || stats.allow_rate < MIN_CONFIDENCE || stats.allow_rate > MAX_CONFIDENCE) throw new Error("审批统计数据无效");
}
export function activate(host) {
  const api = { context: host.context, onTheme: (listener) => host.onTheme(listener),
    readSettings: () => host.request("xsec.approvals.settings.get", {}), writeSettings: (input) => host.request("xsec.approvals.settings.set", input),
    list: (params) => host.request("xsec.approvals.list", params), statistics: (params) => host.request("xsec.approvals.statistics", params), detail: (params) => host.request("xsec.approvals.detail", params) };
  console.debug("approvals.activate", { surface: api.context?.kind === "settings-page" ? "settings" : "workspace" });
  return api.context?.kind === "settings-page" ? new SettingsPage(api) : new WorkspacePage(api);
}
