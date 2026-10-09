export type Tone = 'neutral' | 'success' | 'warning' | 'danger';
export const DECISIONS: Record<string, [
    string,
    Tone
]> = { allowed: ['允许', 'success'], denied: ['拒绝', 'danger'], manual_review: ['人工审批', 'warning'], bypass: ['绕过', 'warning'], error: ['错误', 'danger'] };
export const RISKS: Record<string, string> = { low: '低', medium: '中', high: '高', critical: '严重' };
export const MODES: Record<string, string> = { manual: '人工', auto_llm: 'LLM', full_access: '完全访问' };
export const WINDOWS = [{ value: 'all', label: '全部' }, { value: '24h', label: '24 小时' }, { value: '7d', label: '7 天' }, { value: '30d', label: '30 天' }] as const;
export type WindowValue = typeof WINDOWS[number]['value'];
export const WINDOW_MS = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
export const FULL_ACCESS_CONFIRMATION = '我确认启用完全访问权限';
export interface Context {
    kind?: string;
    settings?: {
        id?: string;
        page?: string;
    };
    session?: {
        session_id?: string;
    };
    workspace?: {
        session?: {
            session_id?: string;
        };
        binding?: {
            sessionId?: string;
        };
    };
}
export interface Api {
    context: Context;
    onTheme: (callback: (theme: Record<string, string>) => void) => {
        dispose(): void;
    };
    list: (params: Record<string, unknown>) => Promise<unknown>;
    statistics: (params: Record<string, unknown>) => Promise<unknown>;
    detail: (params: Record<string, unknown>) => Promise<unknown>;
    readSettings: () => Promise<unknown>;
    writeSettings: (input: SaveInput) => Promise<unknown>;
}
export interface ApprovalRow {
    id: string;
    request_id: string;
    session_id: string;
    created_at: number;
    tool_name: string;
    mode: string;
    decision: string;
    final_decision?: string | null;
    command_preview?: string | null;
    reason?: string | null;
    [key: string]: unknown;
}
export interface Cursor {
    createdAt: number;
    id: string;
}
export interface Page {
    rows: ApprovalRow[];
    nextCursor: Cursor | null;
}
export interface Statistics {
    approval_request_count: number;
    allowed_count: number;
    denied_count: number;
    manual_review_count: number;
    bypass_count: number;
    allow_rate: number;
}
export interface Chunk {
    data: string;
    revision: string;
    nextOffset: number | null;
}
export interface Settings {
    auto_enabled: boolean;
    full_access: boolean;
    allow_local_readonly: boolean;
    low_confidence_threshold: number;
    llm: {
        use_default_model: boolean;
        model?: string;
        timeout_ms: number;
    };
    resolved_model?: {
        error?: string;
        model?: string;
        provider?: string;
        api_key_available?: boolean;
    };
    api_key_configured?: boolean;
}
export interface Draft {
    auto: boolean;
    full: boolean;
    readonly: boolean;
    threshold: string;
    model: string;
    timeout: string;
    acknowledge: boolean;
    confirm: string;
}
export interface SaveInput {
    autoEnabled: boolean;
    fullAccess: boolean;
    allowLocalReadonly: boolean;
    lowConfidenceThreshold: number;
    llm: {
        model: string;
        timeoutMs: number;
        temperature: 0;
    };
    fullAccessAcknowledged: boolean;
}
export interface UiError {
    message: string;
    operationId: string;
}
export function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function sessionIdFrom(context: Context) {
    const value = context.workspace?.session?.session_id ?? context.workspace?.binding?.sessionId ?? context.session?.session_id;
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !value.trim())
        throw new Error('会话标识无效');
    return value;
}
export function settingsContextKey(context: Context) {
    return JSON.stringify([context.kind, context.settings?.id, context.settings?.page]);
}
export function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
export function failure(event: string, error: unknown, operationId: string): UiError {
    console.error(event, { operation_id: operationId, outcome: 'failed' });
    return { message: errorMessage(error), operationId };
}
export function operation() {
    return crypto.randomUUID();
}
export function validateRow(value: unknown, session: string): ApprovalRow {
    if (!record(value) || value.session_id !== session || typeof value.id !== 'string' || !value.id || typeof value.request_id !== 'string' || !value.request_id || !Number.isSafeInteger(value.created_at) || typeof value.tool_name !== 'string' || typeof value.mode !== 'string' || typeof value.decision !== 'string')
        throw new Error('审批记录会话或格式无效');
    return value as unknown as ApprovalRow;
}
export function validatePage(value: unknown, session: string): Page {
    if (!record(value) || !Array.isArray(value.rows))
        throw new Error('审批列表分页数据无效');
    const rows = value.rows.map(row => validateRow(row, session));
    const cursor = value.nextCursor, last = rows.at(-1);
    if (cursor !== null && (!record(cursor) || !Number.isSafeInteger(cursor.createdAt) || Number(cursor.createdAt) < 0 || !last || cursor.id !== last.id || cursor.createdAt !== last.created_at))
        throw new Error('审批列表分页游标无效');
    return { rows, nextCursor: cursor as Cursor | null };
}
export function validateStatistics(value: unknown): Statistics {
    const counts = ['approval_request_count', 'allowed_count', 'denied_count', 'manual_review_count', 'bypass_count'];
    if (!record(value) || counts.some(key => !Number.isSafeInteger(value[key]) || Number(value[key]) < 0) || typeof value.allow_rate !== 'number' || !Number.isFinite(value.allow_rate) || value.allow_rate < 0 || value.allow_rate > 1)
        throw new Error('审批统计数据无效');
    return value as unknown as Statistics;
}
export function validateChunk(value: unknown, offset: number, revision?: string): Chunk {
    if (!record(value) || typeof value.data !== 'string' || !value.data || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision) || (revision !== undefined && value.revision !== revision))
        throw new Error('审批详情分片或版本无效');
    const end = offset + new TextEncoder().encode(value.data).length;
    if (value.nextOffset !== null && (!Number.isSafeInteger(value.nextOffset) || value.nextOffset !== end))
        throw new Error('审批详情分片位置无效');
    return value as unknown as Chunk;
}
export function validateSettings(value: unknown): Settings {
    if (!record(value) || typeof value.auto_enabled !== 'boolean' || typeof value.full_access !== 'boolean' || typeof value.allow_local_readonly !== 'boolean' || typeof value.low_confidence_threshold !== 'number' || !Number.isFinite(value.low_confidence_threshold) || value.low_confidence_threshold < 0 || value.low_confidence_threshold > 1 || !record(value.llm) || typeof value.llm.use_default_model !== 'boolean' || (!value.llm.use_default_model && typeof value.llm.model !== 'string') || !Number.isSafeInteger(value.llm.timeout_ms) || Number(value.llm.timeout_ms) < 1000)
        throw new Error('审批设置响应无效');
    if (value.resolved_model !== undefined && value.resolved_model !== null) {
        if (!record(value.resolved_model) || ['error', 'model', 'provider'].some(key => value.resolved_model && record(value.resolved_model) && value.resolved_model[key] !== undefined && value.resolved_model[key] !== null && typeof value.resolved_model[key] !== 'string') || (value.resolved_model.api_key_available !== undefined && typeof value.resolved_model.api_key_available !== 'boolean'))
            throw new Error('审批模型状态响应无效');
    }
    return value as unknown as Settings;
}
export function settingsDraft(value: Settings): Draft {
    return { auto: value.auto_enabled, full: value.full_access, readonly: value.allow_local_readonly, threshold: String(value.low_confidence_threshold), model: value.llm.use_default_model ? '' : value.llm.model!, timeout: String(value.llm.timeout_ms), acknowledge: false, confirm: '' };
}
export function saveInput(draft: Draft): SaveInput {
    const threshold = draft.threshold.trim(), timeout = draft.timeout.trim();
    if (!threshold || !Number.isFinite(Number(threshold)) || Number(threshold) < 0 || Number(threshold) > 1)
        throw new Error('低置信度阈值必须是 0 到 1 之间的数字。');
    if (!timeout || !Number.isSafeInteger(Number(timeout)) || Number(timeout) < 1000)
        throw new Error('模型超时必须是不小于 1000 毫秒的安全整数。');
    const acknowledged = draft.full && draft.acknowledge && draft.confirm === FULL_ACCESS_CONFIRMATION;
    if (draft.full && !acknowledged)
        throw new Error('启用完全访问前，请确认风险声明并输入确认语句。');
    return { autoEnabled: draft.auto, fullAccess: draft.full, allowLocalReadonly: draft.readonly, lowConfidenceThreshold: Number(threshold), llm: { model: draft.model.trim(), timeoutMs: Number(timeout), temperature: 0 }, fullAccessAcknowledged: acknowledged };
}
export function decisionInfo(row: ApprovalRow): [
    string,
    Tone
] {
    const value = row.final_decision || row.decision;
    return DECISIONS[value] ?? [value, 'neutral'];
}
export function text(value: unknown) {
    return value === undefined || value === null || value === '' ? '—' : String(value);
}
export function formatTime(value: number) {
    return new Date(value).toLocaleString('zh-CN');
}
export function detailItems(row: ApprovalRow): Array<[
    string,
    string,
    boolean
]> {
    const policyValue = row.policy_codes_json;
    const items: Array<[
        string,
        unknown,
        boolean?
    ]> = [['请求 ID', row.request_id, true], ['工具', row.tool_name], ['最终决策', decisionInfo(row)[0]], ['自动审批决定', row.gateway_decision ? DECISIONS[String(row.gateway_decision)]?.[0] ?? row.gateway_decision : undefined], ['决定来源', row.resolution_source], ['风险等级', row.risk_level ? RISKS[String(row.risk_level)] ?? row.risk_level : undefined], ['审批模式', MODES[row.mode] ?? row.mode], ['命令', row.command_preview, true], ['工作目录', row.cwd, true], ['参数', row.arguments_preview, true], ['自动审批原因', row.gateway_reason || row.reason], ['自动审批指引', row.gateway_guidance || row.agent_guidance], ['人工最终原因', row.final_reason], ['模型失败码', row.llm_failure_code], ['命中策略', policyValue], ['审批模型', row.model_name], ['置信度', row.model_confidence == null ? undefined : `${(Number(row.model_confidence) * 100).toFixed(1)}%`], ['耗时', row.model_latency_ms == null ? undefined : `${row.model_latency_ms} ms`], ['执行状态', row.execution_status], ['执行错误', row.execution_error], ['审批时间', row.approval_started_at == null ? undefined : formatTime(Number(row.approval_started_at))]];
    return items.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value, code]) => [label, text(value), Boolean(code)]);
}
