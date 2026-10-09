import { operation, failure, saveInput, settingsDraft, settingsContextKey, validateSettings, type Api, type Context, type Draft, type Settings, type UiError } from './core';
interface SaveOwner {
    revision: number;
    lifecycle: number;
    reloadQueued: boolean;
}
export class SettingsController {
    readonly listeners = new Set<() => void>();
    version = 0;
    readonly state = { ready: false, loading: false, saving: false, settings: undefined as Settings | undefined, draft: undefined as Draft | undefined, error: undefined as UiError | undefined, saved: false };
    private loadRevision = 0;
    private lifecycle = 0;
    private disposed = true;
    private contextKey: string;
    private activeSave?: SaveOwner;
    constructor(private readonly api: Api) {
        this.contextKey = settingsContextKey(api.context);
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
        return !this.disposed && revision === this.loadRevision;
    }
    async load() {
        if (this.disposed)
            return;
        if (this.activeSave) {
            this.activeSave.reloadQueued = true;
            return;
        }
        const revision = ++this.loadRevision, operationId = operation(), started = performance.now(), s = this.state;
        s.ready = false;
        s.loading = true;
        s.error = undefined;
        s.saved = false;
        this.emit();
        console.info('approvals.settings.load.started', { operation_id: operationId });
        try {
            const raw = await this.api.readSettings();
            if (!this.current(revision))
                return;
            const settings = validateSettings(raw);
            s.settings = settings;
            s.draft = settingsDraft(settings);
            s.ready = true;
            console.info('approvals.settings.load.completed', { operation_id: operationId, outcome: 'success', duration_ms: performance.now() - started });
        }
        catch (error) {
            if (this.current(revision))
                s.error = failure('approvals.settings.load.failed', error, operationId);
        }
        finally {
            if (this.current(revision)) {
                s.loading = false;
                this.emit();
            }
        }
    }
    edit<K extends keyof Draft>(key: K, value: Draft[K]) {
        if (!this.state.ready || this.state.saving || !this.state.draft)
            return;
        const next = { ...this.state.draft, [key]: value };
        if (key === 'full' && value === false) {
            next.acknowledge = false;
            next.confirm = '';
        }
        this.state.draft = next;
        this.state.saved = false;
        this.state.error = undefined;
        this.emit();
    }
    private owns(save: SaveOwner) {
        return this.activeSave === save && this.current(save.revision) && save.lifecycle === this.lifecycle;
    }
    async save() {
        const s = this.state;
        if (!s.ready || !s.draft || this.activeSave || this.disposed)
            return;
        const operationId = operation();
        let input;
        try {
            input = saveInput(s.draft);
        }
        catch (error) {
            s.error = { message: error instanceof Error ? error.message : String(error), operationId };
            this.emit();
            return;
        }
        const owner: SaveOwner = { revision: ++this.loadRevision, lifecycle: this.lifecycle, reloadQueued: false };
        this.activeSave = owner;
        s.saving = true;
        s.saved = false;
        s.error = undefined;
        this.emit();
        const started = performance.now();
        console.info('approvals.settings.save.started', { operation_id: operationId, full_access_enabled: input.fullAccess });
        try {
            const raw = await this.api.writeSettings(input);
            if (!this.owns(owner))
                return;
            const settings = validateSettings(raw);
            s.settings = settings;
            s.draft = settingsDraft(settings);
            s.ready = true;
            s.saved = true;
            console.info('approvals.settings.save.completed', { operation_id: operationId, outcome: 'success', duration_ms: performance.now() - started });
        }
        catch (error) {
            if (this.owns(owner))
                s.error = failure('approvals.settings.save.failed', error, operationId);
        }
        finally {
            if (this.activeSave === owner) {
                this.activeSave = undefined;
                s.saving = false;
                this.emit();
                if (owner.reloadQueued && !this.disposed)
                    void this.load();
            }
        }
    }
    begin(context: Context) {
        this.disposed = false;
        this.lifecycle++;
        this.contextKey = settingsContextKey(context);
        this.state.ready = false;
        console.info('approvals.settings.mount');
        return this.load();
    }
    update(context: Context) {
        const key = settingsContextKey(context);
        if (key === this.contextKey)
            return;
        this.contextKey = key;
        return this.load();
    }
    dispose() {
        console.debug('approvals.settings.dispose');
        this.disposed = true;
        this.lifecycle++;
        this.loadRevision++;
        if (this.activeSave)
            this.activeSave.reloadQueued = false;
    }
}
