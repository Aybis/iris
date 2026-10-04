import { useCallback, useEffect, useRef, useState } from 'react';
import { Simulator } from '../../shared/simulator';
import { diagnosticsSchema, telemetrySchema } from '../../shared/types';
import type { ActionResult, AppConfig, ChannelId, Diagnostics, HistoryPoint, Scenario, Telemetry } from '../../shared/types';

export type ConnectionState='connecting'|'mock'|'live'|'fallback'|'reconnecting'|'auth-required'|'unavailable';
type Action = {type:'scenario';scenario:Scenario}|{type:'ping';id:ChannelId}|{type:'retry'|'discard';id:string};
const emptyConfig:AppConfig={mode:'mock',actionsEnabled:false,scenario:null,authenticationRequired:false};

export function useTelemetry(){
  const simulatorRef=useRef<Simulator|null>(null);
  if(!simulatorRef.current)simulatorRef.current=new Simulator();
  const [telemetry,setTelemetry]=useState<Telemetry>(()=>simulatorRef.current!.getTelemetry());
  const [diagnostics,setDiagnostics]=useState<Diagnostics|null>(null);
  const [history,setHistory]=useState<HistoryPoint[]>([]);
  const [connection,setConnection]=useState<ConnectionState>('connecting');
  const [config,setConfig]=useState<AppConfig>(emptyConfig);
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [lastReceived,setLastReceived]=useState(0);
  const [clock,setClock]=useState(Date.now());
  const configRef=useRef(emptyConfig);
  const connectionRef=useRef<ConnectionState>('connecting');
  const pendingRef=useRef(false);
  const validAtRef=useRef(0);
  const reconnectRef=useRef<()=>void>(()=>{});
  const aliveRef=useRef(true);
  const actionAbortRef=useRef<AbortController|null>(null);
  const changeConnection=useCallback((state:ConnectionState)=>{connectionRef.current=state;setConnection(state);},[]);
  const accept=useCallback((data:unknown)=>{
    const parsed=telemetrySchema.safeParse(data);
    if(!parsed.success)throw new Error('Telemetry failed schema validation. The previous snapshot is retained.');
    setTelemetry(parsed.data);setLastReceived(Date.now());validAtRef.current=Date.now();
    setHistory(previous=>{
      const point:HistoryPoint={timestamp:parsed.data.timestamp,tps:parsed.data.system.global_tps,heap:parsed.data.system.heap_memory_pct,queue:parsed.data.queues.inbound_depth,workers:parsed.data.system.active_threads};
      const filtered=previous.filter(p=>p.timestamp!==point.timestamp && Date.parse(p.timestamp)>=Date.parse(point.timestamp)-60000);
      return [...filtered,point].slice(-61);
    });
  },[]);
  const fetchJson=useCallback(async(path:string,options:RequestInit={})=>{
    const response=await fetch(path,{credentials:'same-origin',...options,signal:options.signal??AbortSignal.timeout(7000)});
    const data=await response.json().catch(()=>({message:`Server returned ${response.status}`}));
    if(response.status===401){changeConnection('auth-required');throw new Error('Operator authentication is required.');}
    if(!response.ok)throw new Error(data.message??data.error??`Request failed (${response.status}).`);
    return data;
  },[changeConnection]);
  const refresh=useCallback(async()=>{
    const data=await fetchJson('/api/telemetry');accept(data);
    const detail=await fetchJson('/api/diagnostics').catch(()=>null);
    const parsed=diagnosticsSchema.safeParse(detail);setDiagnostics(parsed.success?parsed.data:null);
  },[fetchJson,accept]);

  useEffect(()=>{
    aliveRef.current=true;
    let disposed=false, socket:WebSocket|null=null, retryTimer:ReturnType<typeof setTimeout>|undefined, fallbackTimer:ReturnType<typeof setTimeout>|undefined;
    let retries=0, connecting=false;
    const startFallback=()=>{
      if(disposed||configRef.current.mode==='live'||configRef.current.authenticationRequired)return;
      changeConnection('fallback');setDiagnostics(simulatorRef.current!.getDiagnostics());accept(simulatorRef.current!.getTelemetry());
    };
    const schedule=()=>{
      if(disposed||connectionRef.current==='auth-required')return;
      clearTimeout(retryTimer);
      const wait=Math.min(30000,1000*2**Math.min(retries++,5))+Math.random()*300;
      retryTimer=setTimeout(connect,wait);
    };
    const connect=async()=>{
      if(disposed||connecting)return;connecting=true;
      try{
        const settings=await fetchJson('/api/config') as AppConfig;
        if(disposed)return;
        configRef.current=settings;setConfig(settings);
        if(settings.mode==='live'&&connectionRef.current==='fallback'){changeConnection('connecting');setHistory([]);setDiagnostics(null);}
        await refresh();if(disposed)return;
        const protocol=location.protocol==='https:'?'wss:':'ws:';
        socket=new WebSocket(`${protocol}//${location.host}/ws/telemetry`);
        socket.onopen=()=>{
          if(disposed){socket?.close();return;}
          retries=0;clearTimeout(fallbackTimer);setError('');changeConnection(settings.mode==='live'?'live':'mock');
        };
        socket.onmessage=(event)=>{
          if(disposed)return;
          try{accept(JSON.parse(event.data));setError('');}
          catch(problem){setError(problem instanceof Error?problem.message:'Invalid stream payload.');}
        };
        socket.onerror=()=>{if(!disposed)setError('Telemetry stream interrupted. Reconnecting automatically.');};
        socket.onclose=()=>{
          if(disposed)return;
          if(connectionRef.current!=='auth-required')changeConnection('reconnecting');
          if(settings.mode==='mock')fallbackTimer=setTimeout(startFallback,3000);
          schedule();
        };
      }catch(problem){
        if(disposed)return;
        setError(problem instanceof Error?problem.message:'Telemetry service is unavailable.');
        if(connectionRef.current!=='auth-required'){
          if(configRef.current.mode==='live'){changeConnection('unavailable');setDiagnostics(null);}
          else if(connectionRef.current!=='fallback')startFallback();
          schedule();
        }
      }finally{connecting=false;}
    };
    reconnectRef.current=()=>{clearTimeout(retryTimer);socket?.close();changeConnection('connecting');void connect();};
    void connect();
    const interval=setInterval(()=>{
      setClock(Date.now());
      if(connectionRef.current==='fallback'){accept(simulatorRef.current!.tick(new Date()));setDiagnostics(simulatorRef.current!.getDiagnostics());}
    },1000);
    const diagnosticsTimer=setInterval(()=>{
      if(connectionRef.current!=='live'&&connectionRef.current!=='mock')return;
      void fetchJson('/api/diagnostics').then(data=>{if(disposed)return;const parsed=diagnosticsSchema.safeParse(data);setDiagnostics(parsed.success?parsed.data:null);}).catch(()=>{if(!disposed)setDiagnostics(null);});
    },3000);
    return()=>{disposed=true;aliveRef.current=false;clearInterval(interval);clearInterval(diagnosticsTimer);clearTimeout(retryTimer);clearTimeout(fallbackTimer);socket?.close();actionAbortRef.current?.abort();};
  },[accept,changeConnection,fetchJson,refresh]);

  const stale=lastReceived===0||clock-lastReceived>5000||Date.now()-Date.parse(telemetry.timestamp)>7000;
  const canAct=(connection==='fallback'||((connection==='mock'||connection==='live')&&config.actionsEnabled))&&!stale;
  const execute=useCallback(async(action:Action):Promise<ActionResult>=>{
    if(pendingRef.current)return {ok:false,message:'Another action is still in progress.'};
    const source=connectionRef.current;
    if(Date.now()-validAtRef.current>5000)return {ok:false,message:'Telemetry is stale. Reconnect before changing queue state.'};
    if(source!=='fallback' && !['mock','live'].includes(source))return {ok:false,message:'Reconnect to telemetry before performing an action.'};
    if(source!=='fallback'&&!configRef.current.actionsEnabled)return {ok:false,message:'Actions are disabled for this data source.'};
    pendingRef.current=true;const key=action.type==='scenario'?`scenario:${action.scenario}`:`${action.type}:${action.id}`;setPending(key);
    try{
      let result:ActionResult;
      if(source==='fallback'){
        const sim=simulatorRef.current!;
        result=action.type==='scenario'?sim.setScenario(action.scenario):action.type==='ping'?sim.ping(action.id):action.type==='retry'?sim.retry(action.id):sim.discard(action.id);
        accept(sim.getTelemetry());setDiagnostics(sim.getDiagnostics());
      }else{
        const controller=new AbortController();actionAbortRef.current=controller;
        const path=action.type==='scenario'?'/api/scenario':action.type==='ping'?`/api/channels/${action.id}/ping`:`/api/dlq/${encodeURIComponent(action.id)}${action.type==='retry'?'/retry':''}`;
        result=await fetchJson(path,{method:action.type==='discard'?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:action.type==='scenario'?JSON.stringify({scenario:action.scenario}):undefined,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
        await refresh();
      }
      if(action.type==='scenario'&&result.ok)setHistory([]);
      return result;
    }catch(problem){return {ok:false,message:problem instanceof Error?problem.message:'Action failed. Verify state before retrying.'};}
    finally{pendingRef.current=false;if(aliveRef.current)setPending(null);}
  },[accept,fetchJson,refresh]);
  const getPayload=useCallback(async(txId:string)=>{
    if(connectionRef.current==='fallback')return simulatorRef.current!.getPayload(txId);
    return fetchJson(`/api/dlq/${encodeURIComponent(txId)}`);
  },[fetchJson]);
  const authenticate=useCallback(async(token:string)=>{
    await fetchJson('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});reconnectRef.current();
  },[fetchJson]);
  return {telemetry,diagnostics,history,connection,config,pending,error,stale,canAct,lastReceived,execute,getPayload,authenticate,reconnect:()=>reconnectRef.current()};
}
