import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {ResearchStore} from './research-store.mjs';
import {createHostedAssistant} from './hosted-assistant.mjs';
import {databasePath} from './runtime-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(String(value)).digest();
function json(res,status,body){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));}
async function body(req,limit=500000){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('Expected application/json');
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw Error('Request is too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function createWorkspace({store,password,staticDir=path.join(root,'dist'),assistant=createHostedAssistant(),authLimit=20,authWindowMs=600000,now=Date.now,logger=entry=>console.error(JSON.stringify(entry))}={}){
  if(!store||typeof password!=='string'||password.length<16)throw Error('Set RADAR_WORKSPACE_PASSWORD to a private password of at least 16 characters');
  const expected=hash('radar:'+password),attempts=new Map();
  const securityHeaders={'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-hashes' 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.arcgis.com https://*.arcgisonline.com https://hazards.fema.gov https://fwspublicservices.wim.usgs.gov https://geo.dot.gov https://overpass-api.de https://overpass.kumi.systems https://gis.lehighcounty.org https://gis.northamptoncounty.org; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
  return http.createServer(async(req,res)=>{
    const requestId=randomUUID();for(const [key,value] of Object.entries(securityHeaders))res.setHeader(key,value);res.setHeader('x-request-id',requestId);
    try{
      if(req.url==='/healthz'&&req.method==='GET')return json(res,200,{status:'ok'});
      const identity=req.socket.remoteAddress||'unknown',time=now();
      for(const [key,value] of attempts)if(time-value.started>=authWindowMs)attempts.delete(key);
      const failures=attempts.get(identity);
      if(failures&&failures.count>=authLimit){res.setHeader('retry-after',String(Math.max(1,Math.ceil((authWindowMs-(time-failures.started))/1000))));return json(res,429,{error:'Too many sign-in attempts. Try again later.',requestId});}
      const authorization=String(req.headers.authorization||'');
      const decoded=authorization.startsWith('Basic ')?Buffer.from(authorization.slice(6),'base64').toString():'';
      if(!timingSafeEqual(hash(decoded),expected)){
        if(attempts.size>=10000&&!attempts.has(identity)){res.setHeader('retry-after','60');return json(res,429,{error:'Sign-in temporarily unavailable. Try again later.',requestId});}
        attempts.set(identity,{started:failures?.started??time,count:(failures?.count||0)+1});
        res.writeHead(401,{'www-authenticate':'Basic realm="Capital Radar private research", charset="UTF-8"','cache-control':'no-store'});res.end('Authentication required');return;
      }
      attempts.delete(identity);
      const url=new URL(req.url,'http://localhost');
      const origin=req.headers.origin;
      if((origin&&origin!=='http://'+req.headers.host&&origin!=='https://'+req.headers.host)||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Same-origin requests required'});
      if(url.pathname==='/api/radar-agent/status'&&req.method==='GET')return json(res,200,assistant.status());
      if(url.pathname==='/api/radar-agent'&&req.method==='POST'){
        const input=await body(req,35000),controller=new AbortController();
        const cancel=()=>controller.abort();res.on('close',cancel);
        try{const result=await assistant.answer(input,{identity:'workspace',signal:controller.signal});if(!res.destroyed)json(res,result.status,result.body);}
        finally{res.off('close',cancel);}
        return;
      }
      if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{status:'ok',providerData:store.providers()});
      if(url.pathname==='/api/providers'&&req.method==='GET')return json(res,200,store.providers());
      if(url.pathname==='/api/alerts'&&req.method==='GET')return json(res,200,store.alerts());
      if(url.pathname==='/api/parcels'&&req.method==='GET')return json(res,200,store.search(Object.fromEntries(url.searchParams)));
      if(url.pathname==='/api/lists'&&req.method==='GET')return json(res,200,store.lists());
      if(url.pathname==='/api/lists'&&req.method==='POST')return json(res,201,store.saveList(await body(req)));
      if(url.pathname.startsWith('/api/lists/')&&req.method==='DELETE')return json(res,store.deleteList(url.pathname.split('/').pop())?200:404,{status:'removed-if-present'});
      if(url.pathname.startsWith('/api/'))return json(res,404,{error:'Unknown API route'});
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
      const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
      if(relative!=='index.html'&&relative!=='workspace.html'&&!relative.startsWith('assets/'))return json(res,404,{error:'Not found'});
      const filename=path.resolve(staticDir,relative);
      if(!filename.startsWith(path.resolve(staticDir)+path.sep))return json(res,404,{error:'Not found'});
      let data;try{data=await readFile(filename);}catch{return json(res,404,{error:'Run npm run build to prepare static assets'});}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
      res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(error){
      try{logger({requestId,errorType:String(error.name||'Error').slice(0,60),errorCode:typeof error.code==='string'?error.code.slice(0,60):undefined,route:String(req.url||'').split('?')[0].slice(0,200)});}catch{}
      json(res,400,{error:'Request could not be completed. Check your input and try again.',requestId});
    }
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const store=new ResearchStore(databasePath(process.env,root));
  const server=createWorkspace({store,password:process.env.RADAR_WORKSPACE_PASSWORD});
  const port=Number(process.env.PORT||8080);
  const host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log('Authenticated research server listening on port '+port));
  const shutdown=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
