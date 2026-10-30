// This sandbox cannot read the application DOM or cookies. The fragment holds only a validated public path.
(()=>{
const pathFor=function publicAnalyticsPath(value) {
  let url;
  try { url=new URL(value); } catch { return null; }
  if(url.origin!=='https://korascoreai.com')return null;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  const publicRoute=/^\/(?:(?:en|ar|fr|es)(?:\/|$))?(?:(?:live-scores|leagues|forecast|insights|favorites|football|matches|ai-football-forecast|how-football-forecast-works|football-win-probabilities|football-match-insights|forecast-insights-coins)|guides\/expected-goals-xg|match\/[1-9]\d{0,9})?$/;
  return publicRoute.test(path)?(path==='/'?path:path+'/'):null;
};
let path;try{path=decodeURIComponent(location.hash.slice(1));}catch{return;}
const canonical=pathFor('https://korascoreai.com'+path);if(!canonical||canonical!==path)return;
const script=document.createElement('script');script.src='https://analytics.ahrefs.com/analytics.js';script.async=true;script.setAttribute('data-key',"KnCzpv99vGd2zIarJ2GmNA");script.setAttribute('data-page-location','https://korascoreai.com'+canonical);document.head.appendChild(script);
})();
