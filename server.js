// NATH-CODE v2.1 backend — Node.js 18+; football provider key stays on server.
// Run: NATH_API_TOKEN="..." NATH_FOOTBALL_KEY="..." PORT=8080 node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.NATH_API_TOKEN || '';
const ALLOWED_ORIGIN = process.env.NATH_ALLOWED_ORIGIN || '*';
const FOOTBALL_KEY = process.env.NATH_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY || process.env.FOOTBALL_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const INDEX_FILE = path.join(__dirname, 'index.html');
const DATA_DIR = process.env.NATH_DATA_DIR || path.join(__dirname, 'nath-data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const historyFile = path.join(DATA_DIR, 'history.json');
const logFile = path.join(DATA_DIR, 'server-log.jsonl');
const cache = new Map();
function log(type, message) { fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), type, message }) + '\n'); }
function send(res, code, data) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function percentile(sorted,p){if(!sorted.length)return 0;const pos=(sorted.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);}
function analyze(body) {
 const odds=Array.isArray(body.odds)?body.odds.map(Number).filter(x=>Number.isFinite(x)&&x>=1&&x<=100000).slice(-1000):[];
 if(odds.length<10)throw new Error('At least 10 valid odds are required');
 const sorted=[...odds].sort((a,b)=>a-b),n=odds.length,recent=odds.slice(-Math.min(50,n)).sort((a,b)=>a-b),p=(a,k)=>percentile(a,k),blend=k=>p(sorted,k)*.65+p(recent,k)*.35;
 const mean=odds.reduce((s,x)=>s+x,0)/n,variance=odds.reduce((s,x)=>s+(x-mean)**2,0)/(n>1?n-1:1),recentRaw=odds.slice(-Math.min(50,n)),prior=odds.slice(Math.max(0,n-recentRaw.length*2),n-recentRaw.length),avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0,delta=prior.length?(avg(recentRaw)-avg(prior))/Math.max(avg(prior),1)*100:0;
 const trend=!prior.length?'Hakuna kipindi cha kulinganisha':delta>10?'Juu':delta< -10?'Chini':'Imetulia';
 const range={wide:`${blend(.10).toFixed(2)}x – ${blend(.90).toFixed(2)}x`,centralLow:`${blend(.25).toFixed(2)}x`,centralHigh:`${blend(.75).toFixed(2)}x`};
 const lo=body.rangeMin==null?null:Number(body.rangeMin),hi=body.rangeMax==null?null:Number(body.rangeMax);let requestedRange=null;
 if(Number.isFinite(lo)&&Number.isFinite(hi)&&lo>=1&&hi>lo){const hits=odds.filter(x=>x>=lo&&x<=hi).length;requestedRange={min:lo,max:hi,coverage:(hits/n*100).toFixed(2)};}
 return {range,sampleSize:n,recentRange:`${p(recent,.10).toFixed(2)}–${p(recent,.90).toFixed(2)}x`,trend,quality:n<30?'Ndogo':n<100?'Wastani':'Nzuri',stdDev:Math.sqrt(variance).toFixed(3),q10:`${p(sorted,.10).toFixed(2)}x`,q90:`${p(sorted,.90).toFixed(2)}x`,requestedRange,summary:`Server imechambua rounds ${n}; median ${p(sorted,.5).toFixed(2)}x. Hii ni muhtasari wa kihistoria, si utabiri wa uhakika wa round inayofuata.`};
}
async function apiFootball(endpoint, params={}) {
 const url=new URL('https://v3.football.api-sports.io/'+endpoint);
 Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));});
 const key=url.toString();const cached=cache.get(key);if(cached&&cached.until>Date.now())return cached.data;
 const r=await fetch(url,{headers:{'x-apisports-key':FOOTBALL_KEY}});const data=await r.json().catch(()=>({}));
 if(!r.ok||data.errors&&Object.keys(data.errors).length)throw new Error('Football provider: '+(JSON.stringify(data.errors||data.message||r.status).slice(0,300)));
 cache.set(key,{until:Date.now()+60000,data});return data.response||[];
}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
async function findTeam(name){
 const rows=await apiFootball('teams',{search:name});if(!rows.length)throw new Error(`Timu "${name}" haijapatikana. Hakiki spelling au ongeza jina kamili.`);
 const n=norm(name);rows.sort((a,b)=>{const x=norm(a.team.name),y=norm(b.team.name);return (x===n?-3:x.startsWith(n)?-2:x.includes(n)?-1:0)-(y===n?-3:y.startsWith(n)?-2:y.includes(n)?-1:0);});
 const t=rows[0].team;return {id:t.id,name:t.name,logo:t.logo,country:rows[0].venue?.country||''};
}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;}
function teamStats(fixtures,teamId){
 const games=fixtures.filter(f=>f.teams?.home?.id===teamId||f.teams?.away?.id===teamId).filter(f=>f.goals?.home!=null&&f.goals?.away!=null);
 let scored=0,conceded=0,w=0,d=0,l=0;const form=[];
 games.forEach(f=>{const isHome=f.teams.home.id===teamId,gf=Number(isHome?f.goals.home:f.goals.away),ga=Number(isHome?f.goals.away:f.goals.home);scored+=gf;conceded+=ga;if(gf>ga){w++;form.push('W');}else if(gf===ga){d++;form.push('D');}else{l++;form.push('L');}});
 return {played:games.length,scored:games.length?scored/games.length:0,conceded:games.length?conceded/games.length:0,w,d,l,form:form.reverse().join(' ')||'Data haipatikani'};
}
function poisson(lambda,k){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;}
function footballModel(h,a,hs,as,h2h){
 // Blend each team's last-five scoring/conceding rates; neutral fallback is deliberately avoided.
 const lh=Math.max(.15,(hs.scored+as.conceded)/2),la=Math.max(.15,(as.scored+hs.conceded)/2);
 let home=0,draw=0,away=0,over15=0,over25=0,over35=0,btts=0;
 for(let x=0;x<=8;x++)for(let y=0;y<=8;y++){const q=poisson(lh,x)*poisson(la,y);if(x>y)home+=q;else if(x===y)draw+=q;else away+=q;if(x+y>=2)over15+=q;if(x+y>=3)over25+=q;if(x+y>=4)over35+=q;if(x>0&&y>0)btts+=q;}
 const total=home+draw+away;home=home/total;draw=draw/total;away=away/total;
 const pct=x=>Math.round(x*1000)/10;
 const h2played=h2h.length;let hw=0,aw=0,dr=0;h2h.forEach(f=>{const x=f.goals?.home,y=f.goals?.away;if(x==null||y==null)return;const hid=f.teams?.home?.id;if(x===y)dr++;else if((x>y&&hid===h.id)||(x<y&&hid===a.id))hw++;else aw++;});
 const suggestions=[];if(home>=.48)suggestions.push(`${h.name} win`);else if(away>=.48)suggestions.push(`${a.name} win`);else suggestions.push('Double Chance 1X / X2 ichunguzwe');
 if(over25>=.57)suggestions.push('Over 2.5 goals');else if(over15>=.72)suggestions.push('Over 1.5 goals');if(btts>=.56)suggestions.push('Both Teams To Score — Yes');
 return {probabilities:{home:pct(home),draw:pct(draw),away:pct(away)},markets:{doubleChance:{homeOrDraw:pct(home+draw),awayOrDraw:pct(away+draw),noDraw:pct(home+away)},over15:pct(over15),over25:pct(over25),under25:pct(1-over25),over35:pct(over35),bttsYes:pct(btts),bttsNo:pct(1-btts)},h2h:{played:h2played,homeWins:hw,draws:dr,awayWins:aw,summary:h2played?`${h2played} recent meetings retrieved. ${h.name}: ${hw} wins, draws: ${dr}, ${a.name}: ${aw} wins.`:'Hakuna rekodi za H2H zilizopatikana kwa timu hizi.'},goals:{home:lh.toFixed(2),away:la.toFixed(2)},suggestions};
}
async function footballAnalyze(body){
 if(!FOOTBALL_KEY)throw new Error('NATH_FOOTBALL_KEY haijawekwa kwenye server. Weka API-Football key kwenye environment ya server kisha restart.');
 const homeName=String(body.homeTeam||'').trim(),awayName=String(body.awayTeam||'').trim();if(homeName.length<2||awayName.length<2)throw new Error('Weka majina ya timu mbili.');
 const [home,away]=await Promise.all([findTeam(homeName),findTeam(awayName)]);if(home.id===away.id)throw new Error('Umechagua timu moja mara mbili.');
 const [hf,af,h2h]=await Promise.all([apiFootball('fixtures',{team:home.id,last:5}),apiFootball('fixtures',{team:away.id,last:5}),apiFootball('fixtures/headtohead',{h2h:`${home.id}-${away.id}`,last:10})]);
 const hs=teamStats(hf,home.id),as=teamStats(af,away.id);if(hs.played<2||as.played<2)throw new Error('Data za mechi za karibuni hazitoshi kufanya uchambuzi wa kuaminika kwa timu zote mbili.');
 const model=footballModel(home,away,hs,as,h2h);
 let fixture=null;try{const upcoming=await apiFootball('fixtures',{team:home.id,next:10});const f=upcoming.find(x=>(x.teams?.home?.id===away.id||x.teams?.away?.id===away.id));if(f)fixture={league:f.league?.name,date:f.fixture?.date};}catch(e){}
 return {teams:{home,away},fixture,h2h:model.h2h,form:{home:hs.form,away:as.form},goals:model.goals,probabilities:model.probabilities,markets:model.markets,suggestions:model.suggestions,disclaimer:'Makadirio ya kihesabu kutoka mechi za karibuni na H2H zilizopatikana. Si matokeo ya uhakika; majeruhi, vikosi na odds za bookmaker hazijaingizwa kwenye model hii.'};
}
const server=http.createServer((req,res)=>{
 if(req.method==='OPTIONS')return send(res,204,{});
 const pathname=(req.url||'/').split('?')[0];
 if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html')){
  if(!fs.existsSync(INDEX_FILE)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('NATH-CODE dashboard file index.html is missing.');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return fs.createReadStream(INDEX_FILE).pipe(res);
 }
 if(req.method==='GET'&&pathname==='/health')return send(res,200,{status:'ONLINE',system:'NATH-CODE',service:'Unified Football + Aviator Analysis Server',version:'2.1',footballProvider:FOOTBALL_KEY?'configured':'not_configured',modules:{football:!!FOOTBALL_KEY,aviator:true,localBrain:true,cloudAI:!!OPENAI_KEY}});
 if(req.method==='GET'&&pathname==='/api/brain/status')return send(res,200,{system:'NATH-CODE',version:'2.1',architecture:'hybrid',brainLevel:'advanced',status:'ONLINE',modules:{football:{ready:!!FOOTBALL_KEY,provider:FOOTBALL_KEY?'API-Football configured':'API key required'},aviator:{ready:true,engine:'local statistical analysis'},localBrain:{ready:true,features:['statistics','percentiles','historical ranges','probability summaries']},cloudAI:{ready:!!OPENAI_KEY,provider:OPENAI_KEY?'configured':'not configured; optional'}}});
 if(TOKEN&&req.headers.authorization!==`Bearer ${TOKEN}`)return send(res,401,{error:'Unauthorized'});
 const allowed=['/api/nath/analyze','/api/nath/history','/api/football/analyze','/api/brain/analyze'];if(req.method!=='POST'||!allowed.includes(pathname))return send(res,404,{error:'Not found'});
 let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>2_000_000)req.destroy();});req.on('end',async()=>{try{const body=JSON.parse(raw||'{}');
  if(pathname==='/api/nath/analyze'||(pathname==='/api/brain/analyze'&&String(body.module||'').toLowerCase()==='aviator')){const result=analyze(body);log('AVIATOR_ANALYSIS',`analyzed ${result.sampleSize} rounds`);return send(res,200,{module:'aviator',brain:'local',...result});}
  if(pathname==='/api/football/analyze'||(pathname==='/api/brain/analyze'&&String(body.module||'').toLowerCase()==='football')){const result=await footballAnalyze(body);log('FOOTBALL_ANALYSIS',`${body.homeTeam} vs ${body.awayTeam}`);return send(res,200,{module:'football',brain:'hybrid-local',...result});}
  if(pathname==='/api/brain/analyze')return send(res,400,{error:'module must be football or aviator'});
  const odds=Array.isArray(body.odds)?body.odds.map(Number).filter(x=>Number.isFinite(x)&&x>=1&&x<=100000).slice(-1000):[];fs.writeFileSync(historyFile,JSON.stringify({updatedAt:new Date().toISOString(),odds},null,2));log('HISTORY_SYNC',`stored ${odds.length} odds`);return send(res,200,{status:'ok',saved:odds.length,message:`Historia ${odds.length} imehifadhiwa server.`});
 }catch(e){log('ERROR',e.message);return send(res,400,{error:e.message});}});
});
server.listen(PORT,()=>{log('START','NATH-CODE backend v2.1 listening on '+PORT);console.log(`NATH-CODE backend v2.1 listening on ${PORT}`);});
