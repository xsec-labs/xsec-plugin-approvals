export function activate(host) {
  const api = {
    context: host.context,
    onTheme: (callback) => host.onTheme(callback),
    list: (params) => host.request("xsec.approvals.list", params),
    statistics: (params) => host.request("xsec.approvals.statistics", params),
    detail: (params) => host.request("xsec.approvals.detail", params),
    readSettings: () => host.request("xsec.approvals.settings.get", {}),
    writeSettings: (input) => host.request("xsec.approvals.settings.set", input),
  };
  return __CONTROLLER__(api);
}
