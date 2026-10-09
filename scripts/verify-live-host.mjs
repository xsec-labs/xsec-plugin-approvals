// Execute in an isolated Desktop Debug WebView with approval-host-fixture.py data.
function assert(value, message) { if (!value) throw new Error(message); }
export async function verifyLiveHost(options) {
  const nativeClientId = window.__XSEC_NATIVE_CLIENT_ID__;
  assert(typeof nativeClientId === 'string' && nativeClientId.length > 0, 'Native client admission is unavailable');
  const invoke = (command, args = {}) => window.__TAURI__.core.invoke(command, args, {headers:{'x-xsec-client-id':nativeClientId,'x-xsec-request-id':crypto.randomUUID()}});
  const plugin = (await invoke('plugin_installed_manifests')).find(entry => entry.plugin_id === 'com.xsec.workspace.approvals');
  assert(plugin?.trust === 'official-development', 'Attach the Approvals development workspace first');
  const loaded = await invoke('plugin_frontend_load', {pluginId:plugin.plugin_id,expectedSha256:plugin.sha256});
  const url = URL.createObjectURL(new Blob([loaded.source],{type:'text/javascript'}));
  let module;
  try {module=await import(url);} finally {URL.revokeObjectURL(url);}
  const root=document.createElement('div');root.id='approval-host-regression';document.body.append(root);
  const theme={'color-mode':'light','ui-density':'comfortable','reduce-motion':'true','ui-font-size':'14px'};
  const previousStyles=Object.keys(theme).map(key=>[key,document.documentElement.style.getPropertyValue('--xsec-'+key)]);
  for(const [key,value] of Object.entries(theme))document.documentElement.style.setProperty('--xsec-'+key,value);
  let page,sessionId=options.sessionId,sha=plugin.sha256;
  const requests=[],checks=[];let stage='mount';
  const context=()=>({kind:'workspace-tool',workspace:{binding:{sessionId}}});
  const request=async(method,params)=>{
    requests.push({method,params});
    return await invoke("plugin_frontend_rpc",{pluginId:plugin.plugin_id,expectedSha256:sha,sessionId:method.startsWith('xsec.approvals.settings.')?undefined:sessionId,method,params});
  };
  const host={context:context(),request,onTheme(callback){const receive=()=>callback(Object.fromEntries(Object.keys(theme).map(key=>[key,getComputedStyle(document.documentElement).getPropertyValue('--xsec-'+key).trim()])));const observer=new MutationObserver(receive);observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']});receive();return{dispose(){observer.disconnect();}};}};
  const wait=predicate=>new Promise((resolve,reject)=>{
    const observer=new MutationObserver(()=>{if(predicate()){observer.disconnect();clearTimeout(timer);resolve();}});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Rendered approval state did not settle at '+stage));},10_000);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
    if(predicate()){observer.disconnect();clearTimeout(timer);resolve();}
  });
  const rows=()=>[...root.querySelectorAll('.approval-row')];
  const ready=(count,pageNumber)=>wait(()=>rows().length===count&&root.querySelector('.approval-list')?.getAttribute('aria-busy')==='false'&&(!pageNumber||root.querySelector('.approval-pagination span')?.textContent.startsWith('第 '+pageNumber+' 页')));
  const button=name=>{const result=[...root.querySelectorAll('button')].find(entry=>entry.textContent===name||entry.getAttribute('aria-label')===name);assert(result,'Missing '+name);return result;};
  const click=async name=>{const before=requests.length;button(name).click();await wait(()=>requests.length>before);};
  const close=async()=>{const value=document.querySelector('.approval-detail-drawer button[aria-label="关闭"]');assert(value,'Detail close action missing');value.click();await wait(()=>{const drawer=document.querySelector('.approval-detail-drawer');return !drawer||(!drawer.hasAttribute('data-open')&&drawer.hasAttribute('data-ending-style')&&!drawer.querySelector('.approval-details'));});};
  const input=(label,value)=>{const labelElement=[...root.querySelectorAll('label')].find(entry=>entry.textContent===label);assert(labelElement,'Missing field '+label);const field=document.getElementById(labelElement.htmlFor);assert(field instanceof HTMLInputElement,'Input field missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));};
  try {
    window.approvalHostFailure=undefined;
    page=module.activate(host);await page.mount(root,context());await ready(40);
    assert(root.querySelector('.approval-stat strong')?.textContent===String(options.expectedCount),'Host fixture statistics mismatch');
    stage='pagination';const tools=[],pages=[];
    for(const [index,count] of [40,40,5].entries()){stage='page-'+(index+1);await ready(count,index+1);pages.push(count);tools.push(...rows().map(row=>row.querySelector('strong').textContent));if(count===40)await click('下一页');}
    assert(new Set(tools).size===85&&tools.length===85,'Equal-timestamp pagination lost or duplicated records');assert(button('下一页').disabled,'Last page remains enabled');await click('上一页');await ready(40,2);assert(rows()[0].querySelector('strong').textContent===tools[40],'Previous cursor changed');await click('刷新');await ready(40,1);checks.push('pagination');
    stage='detail';rows()[0].click();await wait(()=>document.querySelector('.approval-details')?.textContent.includes(options.expectedArgumentSuffix));
    const chunks=requests.filter(row=>row.method==='xsec.approvals.detail');assert(chunks.length>1&&chunks[1].params.revision,'Detail chunks are not revision pinned');stage='detail-close';await close();checks.push('utf8-detail-chunks');
    stage='filters';input('工具名','  '+options.toolName+'  ');await ready(1);assert(rows()[0].querySelector('strong').textContent===options.toolName,'Tool filter mismatch');input('工具名','');await ready(40);await click('24 小时');await ready(40,1);await click('下一页');await ready(40,2);
    const filtered=requests.filter(row=>row.method==='xsec.approvals.list'&&row.params.sinceMs);assert(filtered.at(-1).params.sinceMs===filtered.at(-2).params.sinceMs,'Time window moved across pages');await click('全部');await ready(40,1);checks.push('tool-and-time-filters');
    stage='sessions';sessionId=options.otherSessionId;await page.update(context());await ready(1);assert(rows()[0].querySelector('strong').textContent==='other-tool','Session update showed old records');sessionId=undefined;await page.update(context());await wait(()=>root.textContent.includes('进入会话后查看审批记录'));assert(rows().length===0,'Unbound records remained');sessionId=options.sessionId;await page.update(context());await ready(40);
    let refused=false;try{await request('xsec.approvals.detail',{requestId:options.foreignRequestId,offset:0});}catch(error){refused=String(error).length>0;}assert(refused,'Cross-session detail was accepted');checks.push('session-binding-rejection');
    stage='failure';sha='0'.repeat(sha.length);await click('刷新');await wait(()=>root.textContent.includes('审批记录读取失败'));assert(rows().length===0&&!root.querySelector('.approval-stat'),'Failure left stale records');sha=plugin.sha256;await click('刷新');await ready(40,1);checks.push('explicit-error-recovery');
    stage='remount';page.dispose();await page.mount(root,context());await ready(40);checks.push('dispose-remount');
    stage='settings';page.dispose();const settingsContext={kind:'settings-page',settings:{id:'approvals',page:'approvals'}};page=module.activate({...host,context:settingsContext});await page.mount(root,settingsContext);await wait(()=>root.querySelector('button[data-action=save-settings]')?.disabled===false);await click('保存设置');await wait(()=>root.querySelector('[role=status]')?.textContent.startsWith('已保存'));checks.push('settings-read-write');
    return{passed:true,version:plugin.version,sha256:plugin.sha256,pages,detailChunks:chunks.length,checks,scope:'native WKWebView DOM and real Tauri broker; closed-state semantics while hidden'};
  } catch(error) {window.approvalHostFailure={stage,rows:rows().length,dialogCount:document.querySelectorAll('[role=dialog]').length,drawer:document.querySelector('.approval-detail-drawer')&&{attributes:document.querySelector('.approval-detail-drawer').getAttributeNames().map(name=>[name,document.querySelector('.approval-detail-drawer').getAttribute(name)]),detailPresent:!!document.querySelector('.approval-detail-drawer .approval-details')},details:!!document.querySelector('.approval-details'),detailLoading:document.body.textContent.includes('正在加载审批详情'),detailError:document.body.textContent.includes('审批详情读取失败'),requestCounts:Object.fromEntries([...new Set(requests.map(r=>r.method))].map(method=>[method,requests.filter(r=>r.method===method).length])),error:String(error)};throw error;} finally {page?.dispose();root.remove();for(const [key,value] of previousStyles){if(value)document.documentElement.style.setProperty('--xsec-'+key,value);else document.documentElement.style.removeProperty('--xsec-'+key);}}
}
