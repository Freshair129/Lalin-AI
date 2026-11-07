// Mocked-IPC UI evidence only. Start Vite on 127.0.0.1:5175 before running.
// Node 24 and Edge required. This does not exercise native commands or real audio.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const base = 'http://127.0.0.1:5175';
const root = path.resolve('docs/validation/evidence/play-v1-p13');
const profile = path.join('F:/cargo-lanes/lalin-play/tmp', `p13-cdp-${Date.now()}`);
await mkdir(root, { recursive: true });
await mkdir(profile, { recursive: true });
const warm = await fetch(`${base}/src/main.tsx`, { signal: AbortSignal.timeout(60000) });
if (!warm.ok) throw Error(`Vite warmup: ${warm.status}`);
const server=net.createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port; await new Promise(r=>server.close(r));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','about:blank'], { stdio: 'ignore' });
let ws;
try {
  let targets;
  for (let i=0;i<100;i++) { try { targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(targets.some(t=>t.type==='page'&&t.url==='about:blank')) break; } catch {} await new Promise(r=>setTimeout(r,200)); }
  const target = targets?.find(t => t.type === 'page' && t.url === 'about:blank');
  if (!target?.webSocketDebuggerUrl) throw Error('Edge CDP did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0; const pending=new Map();
  ws.onmessage = e => { const m=JSON.parse(e.data); if (pending.has(m.id)) { const [resolve,reject]=pending.get(m.id); pending.delete(m.id); m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result); } };
  const c=(method,params={})=>new Promise((resolve,reject)=>{ const n=++id;pending.set(n,[resolve,reject]);ws.send(JSON.stringify({id:n,method,params})); });
  const ev=async expression=>{const r=await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;};
  await c('Page.enable');
  await c('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__calls=[];
    window.__TAURI_INTERNALS__={
      transformCallback:()=>1, unregisterCallback:()=>{}, convertFileSrc:(p)=>'http://asset.localhost/'+encodeURIComponent(p),
      invoke: async (cmd,args)=>{ window.__calls.push({cmd,args});
        if(cmd==='get_library') return {version:1,tracks:[
          {id:'managed',path:'C:\\\\fixture\\\\managed.wav',title:'First Track',artist:'Example Artist',album:'Example Album',duration:120,missing:false,storageKind:'managed',sourceKind:'user',favorite:true,playCount:5,lastPlayedAt:300},
          {id:'linked',path:'C:\\\\fixture\\\\linked.wav',title:'Second Track',artist:'Another Artist',album:'Other Album',duration:180,missing:false,storageKind:'linked',sourceKind:'user',playCount:2,lastPlayedAt:100}
        ]};
        if(cmd==='list_damaged_tracks') return [{id:'broken',title:'Damaged Track',artist:'Example Artist',album:'Example Album',contentHash:'abc',ext:'wav',reason:'missing',sourcePath:'C:\\\\fixture\\\\missing.wav'}];
        if(cmd==='list_youtube_links') return [{id:'yt',url:'https://www.youtube.com/watch?v=fixture',title:'Example link',addedAt:1}];
        if(cmd==='plugin:event|listen') return 1;
        if(cmd==='get_compact_fullscreen') return false;
        if(cmd==='get_play_migration_recovery') return null;
        if(cmd==='get_play_migration_status') return null;
        if(cmd==='get_play_migration_undo_status') return {available:false,reason:null};
        if(cmd==='resolve_media') return 'C:\\\\fixture\\\\managed.wav';
        return null;
      }
    };
  `});
  await c('Page.navigate',{url:base});
  for(let i=0;i<300;i++){if(await ev('document.querySelector("#root")?.children.length > 0'))break;await new Promise(r=>setTimeout(r,200));if(i===299)throw Error('root did not render')}
  const defaultLang=await ev('document.documentElement.lang');
  await ev(`localStorage.setItem('lalin-play:v1:playlists', JSON.stringify({version:1,playlists:[{id:'fixture',name:'Example Playlist',trackIds:[]}]}))`);
  await c('Page.reload');
  const ready=async()=>{for(let i=0;i<200;i++){try {if(await ev("!!document.querySelector('.language-switch button')")) return;} catch {} await new Promise(r=>setTimeout(r,200));} throw Error('render timeout');};
  await new Promise(r=>setTimeout(r,500)); await ready();
  // Collect controls intersecting the viewport, including those partially clipped by
  // a non-scrollable ancestor. Horizontal scroll containers intentionally exempt x.
  const inspect = `(()=>{
    const rect = r => ({left:r.left,top:r.top,right:r.right,bottom:r.bottom});
    const visible = (e,r) => { const s=getComputedStyle(e); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && +s.opacity!==0 && r.right>0 && r.bottom>0 && r.left<innerWidth && r.top<innerHeight; };
    const controls=[...document.querySelectorAll('button,input,select,[role="slider"]')].flatMap(e=>{
      const r=e.getBoundingClientRect(); if(!visible(e,r)) return [];
      let scrollX=false, scrollY=false, clippedBy=[];
      for(let a=e.parentElement;a;a=a.parentElement){
        const s=getComputedStyle(a), b=a.getBoundingClientRect();
        if(/^(auto|scroll)$/.test(s.overflowX)) scrollX=true;
        if(/^(auto|scroll)$/.test(s.overflowY)) scrollY=true;
        if(/^(hidden|clip)$/.test(s.overflowX) && !scrollX && (r.left<b.left-0.5||r.right>b.right+0.5)) clippedBy.push((a.className||a.tagName)+':x');
        if(/^(hidden|clip)$/.test(s.overflowY) && !scrollY && (r.top<b.top-0.5||r.bottom>b.bottom+0.5)) clippedBy.push((a.className||a.tagName)+':y');
      }
      if(!scrollX && (r.left < -0.5 || r.right > innerWidth+0.5)) clippedBy.push('viewport:x');
      if(!scrollY && (r.top < -0.5 || r.bottom > innerHeight+0.5)) clippedBy.push('viewport:y');
      return clippedBy.length ? [{element:e.outerHTML.slice(0,240),rect:rect(r),clippedBy}] : [];
    });
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n, visibleText=[];
    while(n=walker.nextNode()) { const text=n.textContent.trim(); if(!text || !n.parentElement) continue; const range=document.createRange(); range.selectNodeContents(n); const r=range.getBoundingClientRect(); if(!visible(n.parentElement,r)) continue;
      let shown=true; for(let a=n.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),b=a.getBoundingClientRect(); if((/^(hidden|clip|auto|scroll)$/.test(s.overflowX) && (r.right<=b.left||r.left>=b.right))||(/^(hidden|clip|auto|scroll)$/.test(s.overflowY) && (r.bottom<=b.top||r.top>=b.bottom))){shown=false;break;}} if(shown) visibleText.push(text);
    }
    return {clippedControls:controls,visibleText};
  })()`;
  const results=[];
  const names=['home','tracks','favorites','artists','albums','queue','mixer','equalizer','repair','youtube','playlist','settings'];
  for(const width of [1280,360]) for(const locale of ['en','th']) {
    await c('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    await ev(`document.querySelector('.language-switch button:nth-child(${locale==='en'?1:2})').click()`);
    if(locale==='th') { await new Promise(r=>setTimeout(r,100)); await c('Page.reload'); await new Promise(r=>setTimeout(r,500)); await ready(); }
    const lang=await ev('document.documentElement.lang');
    for(const name of names) {
      const index = {home:0,tracks:1,favorites:2,artists:3,albums:4,queue:5,mixer:6,equalizer:7,repair:8,youtube:9,playlist:10,settings:12}[name];
      const clicked=await ev(`(()=>{const buttons=[...document.querySelectorAll('aside button')];const b=${name === 'settings' ? "document.querySelector('aside .settings-link')" : `buttons[${index}]`}; if(!b)return false;b.click();return true})()`);
      if(!clicked){results.push({name,locale,width,error:'navigation button not found'});continue;}
      await new Promise(r=>setTimeout(r,100));
      const data=await ev(`(()=>({lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,footerRect:(()=>{const r=document.querySelector('footer')?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height}:null})(),nestedOverflow:[...document.querySelectorAll('main,aside,section')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,className:e.className,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth})),text:document.body.innerText,clipped:[...document.querySelectorAll('button, label, h1, h2, p')].filter(e=>e.offsetWidth>0 && e.scrollWidth>e.clientWidth+1).map(e=>e.innerText).filter(Boolean)}))()`);
      Object.assign(data, await ev(inspect));
      const shot=await c('Page.captureScreenshot',{format:'png'});
      await writeFile(path.join(root,`${name}-${locale}-${width}.png`),Buffer.from(shot.data,'base64'));
      results.push({name,locale,width,...data});
      if(name==='youtube') { const check=await ev(`(()=>{const before=localStorage.getItem('lalin-play:v1:queue');const b=[...document.querySelectorAll('.youtube-row button')][0];b.click();return {before,after:localStorage.getItem('lalin-play:v1:queue'),calls:window.__calls.filter(x=>x.cmd==='open_youtube_link')}})()`); results.push({check:'youtube external command',locale,width,...check}); }
    }
    const switched=await ev(`(()=>{const b=[...document.querySelectorAll('.top-actions button')].find(x=>/Compact/.test(x.innerText)||/กะทัดรัด/.test(x.innerText));if(!b)return false;b.click();return true})()`);
    if(switched){await new Promise(r=>setTimeout(r,150));const data=await ev(`({lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,text:document.body.innerText})`);Object.assign(data, await ev(inspect));const shot=await c('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,`compact-${locale}-${width}.png`),Buffer.from(shot.data,'base64'));results.push({name:'compact',locale,width,...data}); await ev(`document.querySelector('.top-actions button:nth-child(2)').click()`);await new Promise(r=>setTimeout(r,100));}
    results.push({check:'reload language',locale,width,lang});
  }
  await writeFile(path.join(root,'cdp-results.json'),JSON.stringify({mocked:true,defaultLang,results},null,2));
  console.log(JSON.stringify({defaultLang,count:results.length,errors:results.filter(x=>x.error),overflow:results.filter(x=>x.overflow).map(x=>`${x.name}-${x.locale}-${x.width}`), clipped:results.filter(x=>x.clippedControls?.length).map(x=>({name:x.name,locale:x.locale,width:x.width,controls:x.clippedControls}))},null,2));
} finally {
  ws?.close();
  try {
    const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{browser.onopen=resolve;browser.onerror=reject});
    browser.send(JSON.stringify({id:1,method:'Browser.close'}));
    await new Promise(r=>setTimeout(r,300)); browser.close();
  } catch { edge.kill(); }
}
