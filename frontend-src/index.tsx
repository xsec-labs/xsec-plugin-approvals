import { createRoot, type Root } from 'react-dom/client';
import tokenStyles from '@xsec/design-tokens/styles.css';
import componentStyles from '@xsec/ui-react/styles.css';
import styles from './styles.css';
import { SettingsView, WorkspaceView } from './app';
import { PluginTheme } from './theme';
import { SettingsController } from './settings';
import { WorkspaceController } from './workspace';
import type { Api, Context } from './core';
export function createController(api: Api) {
    const settings = api.context.kind === 'settings-page', controller = settings ? new SettingsController(api) : new WorkspaceController(api);
    let root: Root | undefined;
    console.debug('approvals.activate', { surface: settings ? 'settings' : 'workspace' });
    return {
        mount(element: HTMLElement, context = api.context) {
            if (root)
                throw new Error('审批控制器已经挂载');
            root = createRoot(element);
            root.render(<><style>{tokenStyles + componentStyles + styles}</style><PluginTheme api={api}>{settings ? <SettingsView controller={controller as SettingsController}/> : <WorkspaceView controller={controller as WorkspaceController}/>}</PluginTheme></>);
            return controller.begin(context);
        },
        update(context: Context = api.context) {
            return controller.update(context);
        },
        dispose() {
            controller.dispose();
            root?.unmount();
            root = undefined;
        },
    };
}
