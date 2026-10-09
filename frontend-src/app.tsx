import { useRef, useSyncExternalStore } from 'react';
import { Badge, Checkbox, ControlButton, Drawer, EmptyState, ErrorState, Field, Input, PageHeader, Section, Select, Spinner, Switch, Toolbar } from '@xsec/ui-react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { DECISIONS, FULL_ACCESS_CONFIRMATION, MODES, RISKS, WINDOWS, decisionInfo, formatTime, text, type Draft, type UiError, type Settings } from './core';
import type { WorkspaceController } from './workspace';
import type { SettingsController } from './settings';
function ErrorResult({ error, title, action }: {
    error: UiError;
    title: string;
    action?: React.ReactNode;
}) {
    return <ErrorState title={title} description={error.message} errorId={error.operationId} action={action}/>;
}
export function WorkspaceView({ controller }: {
    controller: WorkspaceController;
}) {
    useSyncExternalStore(controller.subscribe, controller.snapshot);
    const s = controller.state;
    const finalFocus = useRef<HTMLButtonElement | null>(null);
    const refresh = <ControlButton onClick={() => void controller.refreshFirst()} disabled={s.refreshInFlight}><RefreshCw size={15} aria-hidden="true"/>刷新</ControlButton>;
    const stats = s.stats ? [['总数', s.stats.approval_request_count], ['允许', s.stats.allowed_count], ['拒绝', s.stats.denied_count], ['人工', s.stats.manual_review_count], ['绕过', s.stats.bypass_count], ['放行率', `${(s.stats.allow_rate * 100).toFixed(1)}%`]] : [];
    return <main className="approval-page"><PageHeader title="本会话审批记录" actions={refresh}/>
    <section className="approval-summary" aria-label="审批统计">{stats.map(([label, value]) => <div className="approval-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <Toolbar className="approval-filters"><div className="approval-windows" role="group" aria-label="时间范围">{WINDOWS.map(option => <ControlButton key={option.value} data-value={option.value} aria-pressed={s.window === option.value} variant={s.window === option.value ? 'primary' : 'ghost'} onClick={() => void controller.setWindow(option.value)}>{option.label}</ControlButton>)}</div>
      <Field label="决策">{props => <Select {...props} options={[{ value: '', label: '全部决策' }, ...Object.entries(DECISIONS).map(([value, [label]]) => ({ value, label }))]} value={s.decision} onValueChange={value => {
                if (value !== null)
                    void controller.setDecision(value);
            }}/>}</Field>
      <Field label="工具名">{props => <div className="approval-search"><Search size={15} aria-hidden="true"/><Input {...props} type="search" placeholder="筛选工具名" value={s.tool} onChange={event => controller.setTool(event.target.value)}/></div>}</Field>
    </Toolbar>
    <nav className="approval-pagination" aria-label="审批记录分页"><span>第 {s.pageIndex + 1} 页{s.rows ? ` · ${s.rows.length} 条记录` : ''}</span><div><ControlButton aria-label="上一页" disabled={s.refreshInFlight || s.pageIndex === 0} onClick={() => void controller.previous()}><ChevronLeft size={15} aria-hidden="true"/>上一页</ControlButton><ControlButton aria-label="下一页" disabled={s.refreshInFlight || !s.nextCursor} onClick={() => void controller.next()}>下一页<ChevronRight size={15} aria-hidden="true"/></ControlButton></div></nav>
    {!s.session ? <EmptyState title="进入会话后查看审批记录"/> : s.error ? <ErrorResult error={s.error} title="审批记录读取失败" action={refresh}/> : !s.rows ? <Spinner label="正在加载审批记录…"/> : s.rows.length === 0 ? <EmptyState title="本会话暂无审批记录"/> : <section className="approval-list" aria-label="审批记录列表" aria-busy={s.refreshInFlight}>{s.rows.map(row => {
                const [label, tone] = decisionInfo(row);
                return <ControlButton key={row.id} variant="ghost" className="approval-row" aria-label={`查看 ${row.tool_name} 的审批详情`} onClick={event => {
                    finalFocus.current = event.currentTarget;
                    void controller.openDetail(row);
                }}>
      <span className="approval-row-head"><strong>{row.tool_name}</strong><Badge tone={tone}>{label}</Badge></span>
      <span className="approval-meta">{MODES[row.mode] ?? row.mode}{row.risk_level ? ` · 风险：${RISKS[String(row.risk_level)] ?? row.risk_level}` : ''}</span>
      <span className="approval-preview">{text(row.command_preview || row.reason)}</span><time dateTime={new Date(row.created_at).toISOString()}>{formatTime(row.created_at)}</time>
    </ControlButton>;
            })}</section>}

    <Drawer open={Boolean(s.detailRequestId)} onOpenChange={open => {
            if (!open)
                controller.closeDetail();
        }} title="本会话审批详情" finalFocus={finalFocus} className="approval-detail-drawer">
      {s.detailLoading ? <Spinner label="正在加载审批详情…"/> : s.detailError ? <ErrorResult error={s.detailError} title="审批详情读取失败"/> : s.detail ? <><Badge tone={decisionInfo(s.detail)[1]}>{decisionInfo(s.detail)[0]}</Badge><dl className="approval-details">{s.detailItems.map(([label, value, code]) => <div key={label}><dt>{label}</dt><dd className={code ? 'approval-code' : undefined}>{value}</dd></div>)}</dl></> : null}
    </Drawer>
  </main>;
}
function modelStatus(settings: Settings) {
    const value = settings.resolved_model;
    return value?.error ? `模型状态：${value.error}` : value?.model ? `${value.provider || '默认服务商'} / ${value.model}（${value.api_key_available ? '凭据可用' : '凭据不可用'}）` : settings.api_key_configured ? '使用当前会话模型' : '尚未配置固定审批模型';
}
export function SettingsView({ controller }: {
    controller: SettingsController;
}) {
    useSyncExternalStore(controller.subscribe, controller.snapshot);
    const s = controller.state, d = s.draft;
    const disabled = s.saving || !s.ready;
    const edit = <K extends keyof Draft>(key: K, value: Draft[K]) => controller.edit(key, value);
    return <main className="approval-settings"><PageHeader title="审批记录" actions={<ControlButton onClick={() => void controller.load()} disabled={s.loading || s.saving}><RefreshCw size={15} aria-hidden="true"/>重新读取设置</ControlButton>}/>
    {s.error ? <ErrorResult error={s.error} title="审批设置未完成"/> : null}
    {s.loading ? <Spinner label="正在读取审批设置…"/> : null}
    {s.ready && d && s.settings ? <div role="form" aria-label="审批设置" onKeyDown={event => {
                if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                    event.preventDefault();
                    void controller.save();
                }
            }}>
      <Section title="审批策略"><dl className="approval-overview"><div><dt>新会话默认模式</dt><dd>{s.settings.auto_enabled ? 'LLM 自动审批' : '人工审批'}</dd></div><div><dt>完全访问授权</dt><dd>{s.settings.full_access ? '已授权，可显式选择' : '未授权'}</dd></div><div><dt>审批模型策略</dt><dd>{s.settings.llm.use_default_model ? '跟随当前会话模型' : s.settings.llm.model}</dd></div></dl>
        <Switch label="新会话默认使用 LLM 自动审批" checked={d.auto} disabled={disabled} onCheckedChange={value => edit('auto', value)}/>
        <p className="approval-hint">新会话默认策略影响后续创建的会话。当前会话模式在任务界面管理。</p>
        <Switch label="本地只读调用直接放行" checked={d.readonly} disabled={disabled} onCheckedChange={value => edit('readonly', value)}/>
        <Switch label="允许选择完全访问（高风险）" checked={d.full} disabled={disabled} onCheckedChange={value => edit('full', value)}/>
        {d.full ? <section className="approval-risk" aria-labelledby="full-access-title"><h3 id="full-access-title">完全访问确认</h3><p>启用后，普通会话、批量任务和资产发现可以显式选择完全访问。系统危险规则、工作区写入沙箱和审计仍然生效。请仅在目标与操作均已获得授权时继续。</p><Checkbox label="我已了解上述风险，并确认当前操作仅用于合法且已获得授权的目标。" checked={d.acknowledge} disabled={disabled} onCheckedChange={value => edit('acknowledge', value)}/><Field label="请输入确认语句" hint={FULL_ACCESS_CONFIRMATION}>{props => <Input {...props} value={d.confirm} disabled={disabled} autoComplete="off" onChange={event => edit('confirm', event.target.value)}/>}</Field></section> : null}
      </Section>
      <Section title="审批模型"><div className="approval-settings-fields"><Field label="低置信度阈值" hint="0 到 1 之间">{props => <Input {...props} type="number" min={0} max={1} step={0.05} value={d.threshold} disabled={disabled} onChange={event => edit('threshold', event.target.value)}/>}</Field><Field label="模型超时（毫秒）" hint="不小于 1000 毫秒">{props => <Input {...props} type="number" min={1000} step={1000} value={d.timeout} disabled={disabled} onChange={event => edit('timeout', event.target.value)}/>}</Field></div>
        <Field label="审批模型" hint="留空跟随当前会话模型">{props => <Input {...props} value={d.model} disabled={disabled} onChange={event => edit('model', event.target.value)}/>}</Field><p className="approval-model-status">{modelStatus(s.settings)}</p>
      </Section>
      <footer className="approval-settings-footer"><ControlButton variant="primary" data-action="save-settings" onClick={() => void controller.save()} disabled={disabled}>{s.saving ? '正在保存…' : '保存设置'}</ControlButton>{s.saved ? <p role="status">已保存。审批授权和只读放行立即生效；新会话默认策略仅影响之后创建的会话。</p> : null}</footer>
    </div> : null}
  </main>;
}
