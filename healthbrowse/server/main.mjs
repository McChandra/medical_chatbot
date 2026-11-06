// Standalone HTTP entry point for Docker, Cloud Run and Kubernetes. TLS terminates at ingress.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';

const runtime={...process.env};
if(process.env.WORKSPACE_DB_PATH){const {openWorkspace}=await import('./sqlite-workspace.mjs');runtime.DB=openWorkspace(process.env.WORKSPACE_DB_PATH)}
const port=Number(process.env.PORT||8080);
let draining=false;
const server=http.createServer(async (incoming,outgoing)=>{
  const start=performance.now(),requestId=randomUUID();
  let status=500,route='other';
  try{
    const url=new URL(incoming.url,'http://localhost');
    route=['/healthz','/readyz','/api/care','/api/contact','/api/feedback'].includes(url.pathname)?url.pathname:
      url.pathname.startsWith('/api/me/')?'personal-api':url.pathname.startsWith('/api/')?'public-api':'asset';
    if(draining&&route==='/readyz'){status=503;outgoing.writeHead(status);outgoing.end();return}
    const chunks=[];let bytes=0;
    for await(const chunk of incoming){
      bytes+=chunk.length;
      if(bytes>32768){status=413;outgoing.writeHead(status);outgoing.end('Request too large');return}
      chunks.push(chunk);
    }
    const headers=new Headers();
    for(const name of ['authorization','content-type','accept','origin','idempotency-key']){
      const value=incoming.headers[name];if(typeof value==='string')headers.set(name,value);
    }
    const request=new Request(url,{method:incoming.method,headers,
      body:['GET','HEAD'].includes(incoming.method)?undefined:Buffer.concat(chunks)});
    const result=await worker.fetch(request,runtime);status=result.status;
    const responseHeaders=Object.fromEntries(result.headers);responseHeaders['x-request-id']=requestId;
    outgoing.writeHead(status,responseHeaders);
    outgoing.end(incoming.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));
  }catch{
    if(!outgoing.headersSent)outgoing.writeHead(status,{'content-type':'application/json'});
    outgoing.end(JSON.stringify({error:'Request could not be processed.',requestId}));
  }finally{
    if(route!=='/healthz'&&route!=='/readyz')console.info(JSON.stringify({requestId,route,status,elapsedMs:Math.round(performance.now()-start)}));
  }
});
server.headersTimeout=15000;server.requestTimeout=140000;
server.on('clientError',(_error,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
server.listen(port,'0.0.0.0',()=>console.info(JSON.stringify({service:'healthbrowse',port})));
for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>{
  draining=true;server.close();setTimeout(()=>process.exit(0),9000).unref();
});
