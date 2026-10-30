// Public-page analytics only. Never expose private DOM, queries, fragments or titles.
(()=>{
const pathFor=function publicAnalyticsPath(value) {
  let url;
  try { url=new URL(value); } catch { return null; }
  if(url.origin!=='https://korascoreai.com')return null;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  const publicRoute=/^\/(?:(?:en|ar|fr|es)(?:\/|$))?(?:(?:live-scores|leagues|forecast|insights|favorites|football|matches|ai-football-forecast|how-football-forecast-works|football-win-probabilities|football-match-insights|forecast-insights-coins)|guides\/expected-goals-xg|match\/[1-9]\d{0,9})?$/;
  return publicRoute.test(path)?(path==='/'?path:path+'/'):null;
};
let current=null,frame=null,timer=null;
function sync(){const next=pathFor(location.href);if(next===current)return;current=next;if(frame){frame.remove();frame=null;}if(!next||!document.body)return;frame=document.createElement('iframe');frame.hidden=true;frame.title='Public website analytics';frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.src='/ahrefs-public-frame.html#'+encodeURIComponent(next);document.body.appendChild(frame);}
function start(){sync();if(timer===null)timer=setInterval(sync,500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('popstate',sync);window.addEventListener('pageshow',start);
// Observe SPA route changes without replacing history or interfering with auth/payment callbacks.
window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;current=null;if(frame){frame.remove();frame=null;}});
})();
