import { useLayoutEffect, useState, type ReactNode } from 'react';
import { ControlThemeProvider } from '@xsec/ui-react';
import { themeAttributes, type ThemeSettings } from '@xsec/design-tokens';
import type { Api } from './core';
function parseTheme(theme: Record<string, string>): ThemeSettings {
    const mode = theme['color-mode'], density = theme['ui-density'], motion = theme['reduce-motion'], size = theme['ui-font-size'];
    if (mode !== 'light' && mode !== 'dark')
        throw new Error('Host color mode is invalid');
    if (density !== 'compact' && density !== 'comfortable')
        throw new Error('Host UI density is invalid');
    if (motion !== 'true' && motion !== 'false')
        throw new Error('Host reduced motion preference is invalid');
    if (typeof size !== 'string' || !/^\d+(?:\.\d+)?px$/.test(size))
        throw new Error('Host UI font size is invalid');
    const settings: ThemeSettings = { colorMode: mode, density, reducedMotion: motion === 'true', fontScale: Number(size.slice(0, -2)) / 14, locale: 'zh-CN' };
    themeAttributes(settings);
    return settings;
}
function initialTheme() {
    const style = getComputedStyle(document.documentElement);
    return parseTheme(Object.fromEntries(['color-mode', 'ui-density', 'reduce-motion', 'ui-font-size'].map(key => [key, style.getPropertyValue('--xsec-' + key).trim()])));
}
export function PluginTheme({ api, children }: {
    api: Api;
    children: ReactNode;
}) {
    const [settings, setSettings] = useState(initialTheme);
    useLayoutEffect(() => {
        const subscription = api.onTheme(theme => setSettings(parseTheme(theme)));
        return () => subscription.dispose();
    }, [api]);
    return <ControlThemeProvider settings={settings} className="approvals-theme">{children}</ControlThemeProvider>;
}
