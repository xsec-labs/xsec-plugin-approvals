import { operation, failure, sessionIdFrom, validatePage, validateStatistics, validateChunk, validateRow, detailItems, WINDOW_MS, type Api, type ApprovalRow, type Context, type Cursor, type Statistics, type UiError, type WindowValue } from './core';
export class WorkspaceController {
    readonly listeners = new Set<() => void>();
    version = 0;
    readonly state = { session: undefined as string | undefined, revision: 0, rows: undefined as ApprovalRow[] | undefined, stats: undefined as Statistics | undefined, autoRefresh: false, detailRequestId: undefined as string | undefined, detailRevision: 0, detail: undefined as ApprovalRow | undefined, detailItems: [] as Array<[
            string,
            string,
            boolean
        ]>, detailError: undefined as UiError | undefined, detailLoading: false, cursors: [null] as Array<Cursor | null>, pageIndex: 0, nextCursor: null as Cursor | null, sinceMs: undefined as number | undefined, refreshInFlight: false, disposed: true, tool: '', decision: '', window: 'all' as WindowValue, error: undefined as UiError | undefined };
    private context: Context;
    private timer?: ReturnType<typeof setInterval>;
    private debounce?: ReturnType<typeof setTimeout>;
    constructor(private readonly api: Api) {
        this.context = api.context;
    }
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    snapshot = () => this.version;
    private emit() {
        this.version++;
        for (const listener of this.listeners)
            listener();
    }
    private current(revision: number) {
        return revision === this.state.revision && !this.state.disposed;
    }
    private currentDetail(revision: number) {
        return revision === this.state.detailRevision && !this.state.disposed;
    }
    closeDetail = () => {
        const s = this.state;
        s.detailRequestId = undefined;
        s.detailRevision++;
        s.detail = undefined;
        s.detailItems = [];
        s.detailLoading = false;
        s.detailError = undefined;
        this.emit();
    };
    private resetPages() {
        const s = this.state;
        s.revision++;
        s.autoRefresh = false;
        s.refreshInFlight = false;
        s.cursors = [null];
        s.pageIndex = 0;
        s.nextCursor = null;
        s.sinceMs = s.window === 'all' ? undefined : Date.now() - WINDOW_MS[s.window];
        s.rows = undefined;
        s.stats = undefined;
        s.error = undefined;
        this.closeDetail();
    }
    private resetSession(session: string | undefined) {
        clearTimeout(this.debounce);
        this.state.session = session;
        this.resetPages();
    }
    async refresh(options: {
        silent?: boolean;
        pageIndex?: number;
        cursors?: Array<Cursor | null>;
    } = {}) {
        const s = this.state;
        if (s.disposed)
            return;
        const session = sessionIdFrom(this.context);
        if (!session) {
            this.resetSession(undefined);
            this.emit();
            return;
        }
        if (session !== s.session)
            this.resetSession(session);
        const pageIndex = options.pageIndex ?? s.pageIndex, cursors = options.cursors ?? s.cursors, cursor = cursors[pageIndex];
        if (pageIndex < 0 || cursor === undefined)
            throw new Error('审批分页状态无效');
        const revision = ++s.revision, operationId = operation(), started = performance.now();
        s.refreshInFlight = true;
        s.error = undefined;
        if (!options.silent)
            this.closeDetail();
        this.emit();
        try {
            const [rawPage, rawStats] = await Promise.all([this.api.list({ decision: s.decision || undefined, toolName: s.tool.trim() || undefined, sinceMs: s.sinceMs, limit: 40, ...(cursor ? { beforeCreatedAt: cursor.createdAt, beforeId: cursor.id } : {}) }), this.api.statistics(s.window === 'all' ? {} : { window: s.window })]);
            if (!this.current(revision))
                return;
            const page = validatePage(rawPage, session), stats = validateStatistics(rawStats);
            s.rows = page.rows;
            s.stats = stats;
            s.nextCursor = page.nextCursor;
            s.pageIndex = pageIndex;
            s.cursors = cursors;
            s.autoRefresh = true;
            if (!options.silent)
                console.info('approvals.workspace.page.loaded', { operation_id: operationId, page: pageIndex + 1, count: page.rows.length, has_next: Boolean(page.nextCursor), duration_ms: performance.now() - started, outcome: 'success' });
        }
        catch (error) {
            if (!this.current(revision))
                return;
            s.rows = undefined;
            s.stats = undefined;
            s.nextCursor = null;
            s.autoRefresh = false;
            this.closeDetail();
            s.error = failure('approvals.workspace.refresh.failed', error, operationId);
        }
        finally {
            if (this.current(revision)) {
                s.refreshInFlight = false;
                this.emit();
            }
        }
    }
    refreshFirst = () => {
        clearTimeout(this.debounce);
        this.resetPages();
        return this.refresh();
    };
    previous = () => this.refresh({ pageIndex: this.state.pageIndex - 1 });
    next = () => {
        const s = this.state;
        if (!s.nextCursor || s.refreshInFlight)
            return;
        return this.refresh({ pageIndex: s.pageIndex + 1, cursors: [...s.cursors.slice(0, s.pageIndex + 1), s.nextCursor] });
    };
    setDecision = (value: string) => {
        clearTimeout(this.debounce);
        this.state.decision = value;
        this.resetPages();
        return this.refresh();
    };
    setWindow = (value: WindowValue) => {
        if (this.state.window === value)
            return;
        clearTimeout(this.debounce);
        this.state.window = value;
        this.resetPages();
        return this.refresh();
    };
    setTool = (value: string) => {
        this.state.tool = value;
        this.resetPages();
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {
            void this.refresh();
        }, 250);
    };
    async openDetail(row: ApprovalRow) {
        const s = this.state;
        this.closeDetail();
        if (!s.session || s.disposed)
            return;
        const revision = s.detailRevision, session = s.session, operationId = operation(), started = performance.now();
        s.detailRequestId = row.request_id;
        s.detailLoading = true;
        this.emit();
        console.info('approvals.workspace.detail.started', { operation_id: operationId });
        try {
            let offset: number | null = 0, version: string | undefined, serialized = '';
            do {
                const raw = await this.api.detail({ requestId: row.request_id, offset, revision: version });
                if (!this.currentDetail(revision))
                    return;
                const chunk = validateChunk(raw, offset, version);
                serialized += chunk.data;
                version = chunk.revision;
                offset = chunk.nextOffset;
            } while (offset !== null);
            const detail = validateRow(JSON.parse(serialized), session);
            if (detail.request_id !== row.request_id || detail.id !== row.id)
                throw new Error('审批详情归属无效');
            const items = detailItems(detail);
            s.detail = detail;
            s.detailItems = items;
            console.info('approvals.workspace.detail.completed', { operation_id: operationId, outcome: 'success', duration_ms: performance.now() - started });
        }
        catch (error) {
            if (!this.currentDetail(revision))
                return;
            s.detailError = failure('approvals.workspace.detail.failed', error, operationId);
        }
        finally {
            if (this.currentDetail(revision)) {
                s.detailLoading = false;
                this.emit();
            }
        }
    }
    begin(context: Context) {
        clearInterval(this.timer);
        clearTimeout(this.debounce);
        this.context = context;
        this.state.disposed = false;
        this.resetPages();
        console.info('approvals.workspace.mount');
        this.timer = setInterval(() => {
            const s = this.state;
            if (s.autoRefresh && s.pageIndex === 0 && !s.detailRequestId && !s.refreshInFlight && document.visibilityState === 'visible')
                void this.refresh({ silent: true });
        }, 15000);
        return this.refresh();
    }
    update(context: Context) {
        this.context = context;
        if (sessionIdFrom(context) !== this.state.session) {
            console.debug('approvals.workspace.context.changed');
            return this.refresh();
        }
    }
    dispose() {
        console.debug('approvals.workspace.dispose');
        this.state.disposed = true;
        this.state.revision++;
        this.closeDetail();
        clearInterval(this.timer);
        clearTimeout(this.debounce);
    }
}
