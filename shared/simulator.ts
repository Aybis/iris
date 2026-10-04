import { channelIds, scenarioLabels } from './types';
import type { ActionResult, ChannelId, Diagnostics, DlqItem, Incident, Scenario, Telemetry } from './types';
import { translateBip } from './translator';

const names:Record<ChannelId,string> = { BCA:'BCA Virtual Account',MANDIRI:'Mandiri Bill Payment',BNI:'BNI Virtual Account',ASTRAPAY:'AstraPay E-Wallet',QRIS:'QRIS Dynamic' };
const baseTPS=[19.4,11.2,5.5,6.4,8.1];
const baseLatency=[110,145,125,95,130];
const round=(n:number,d=1)=>Number(n.toFixed(d));
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));

/** Deterministic, shared demonstration engine. No real banking requests are made. */
export class Simulator {
  private scenario:Scenario;
  private telemetry!:Telemetry;
  private diagnostics!:Diagnostics;
  private ticks=0;
  private sequence=101;
  private total=142500;
  private succeeded=142243.5;
  private queue=14;
  private items:DlqItem[]=[];
  private payloads=new Map<string,Record<string,unknown>>();
  private incidents:Incident[]=[];
  private retired=new Set<string>();
  private attemptedLatency:Record<ChannelId,number[]>={BCA:[],MANDIRI:[],BNI:[],ASTRAPAY:[],QRIS:[]};
  private heapHistory:Diagnostics['heap_history']=[];
  private currentTime:Date;
  private day:string;
  constructor(scenario:Scenario='normal', now=new Date()) {
    this.scenario=scenario; this.currentTime=new Date(now);this.day=this.dateKey(now);
    this.configure(scenario,now,true);
  }
  private dateKey(now:Date){return now.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});}
  private clock(now=this.currentTime){return now.toISOString();}
  private configure(scenario:Scenario,now:Date,initial=false){
    this.scenario=scenario; this.ticks=0; this.currentTime=new Date(now);this.retired.clear();this.payloads.clear();
    this.queue=({normal:14,flash_sale:88,bni_timeout:140,dlq_influx:78,bca_outage:180,thread_starvation:290})[scenario];
    this.items=[];this.incidents=[];this.heapHistory=[];
    this.attemptedLatency={BCA:[],MANDIRI:[],BNI:[],ASTRAPAY:[],QRIS:[]};
    const count=scenario==='dlq_influx'?12:3;
    for(let i=0;i<count;i++) this.addDeadLetter(i%2===0?'BNI':'BCA',new Date(now.getTime()-(i+1)*34000));
    this.incident('INFO','Gateway control',`${initial?'STARTED':'SCENARIO'}: ${scenarioLabels[scenario]}`,`Demo scenario: ${scenarioLabels[scenario]}. All actions affect simulated data only.`);
    if(scenario==='bni_timeout'||scenario==='bca_outage'){
      const bank=scenario==='bni_timeout'?'BNI':'BCA';
      this.incident('CRITICAL',`${bank} Adapter`,`BIP2230E: SocketTimeoutException on Node 'HTTP_${bank}_Call'; timeout=30000ms; correlation_id=CORR-${bank}-OUTAGE`);
    } else if(scenario==='thread_starvation') this.incident('CRITICAL','ACE Integration Server','WORKER_SATURATION: no available worker threads; correlation_id=CORR-THREAD-101');
    else if(scenario==='flash_sale') this.incident('WARN','Payment Gateway','TRAFFIC_SPIKE: incoming traffic surge','Incoming traffic is rising faster than the gateway can consume it. Watch the buffer and worker pool.');
    else if(scenario==='dlq_influx') this.incident('WARN','MQ Dead Letter Queue','DLQ_GROWTH: repeated business validation failures','Messages are reaching the reject queue after repeated delivery failures. Inspect payloads before retrying.');
    else this.incident('INFO','Partner health','RESOLVED: all partner connection checks passed','All five payment partners are reachable. The integration engine has spare capacity.');
    this.rebuild(false);
  }
  getScenario(){return this.scenario;}
  setScenario(scenario:Scenario):ActionResult{this.configure(scenario,new Date());return {ok:true,message:`Demo switched to ${scenarioLabels[scenario]}.`};}
  getTelemetry():Telemetry{return copy(this.telemetry);}
  getDiagnostics():Diagnostics{return copy(this.diagnostics);}
  tick(now=new Date(this.currentTime.getTime()+1000)){
    this.currentTime=new Date(now);this.ticks++;
    const day=this.dateKey(now);if(day!==this.day){this.day=day;this.total=0;this.succeeded=0;}
    if(this.scenario==='dlq_influx' && this.ticks%3===0 && this.items.length<100) this.addDeadLetter(channelIds[this.ticks%5],now);
    this.rebuild(true);
    if(this.ticks%12===0){
      if(this.scenario==='bni_timeout'||this.scenario==='bca_outage'){
        const bank=this.scenario==='bni_timeout'?'BNI':'BCA';
        this.incident('CRITICAL',`${bank} Adapter`,`BIP2230E: SocketTimeoutException on Node 'HTTP_${bank}_Call'; timeout=30000ms; tx_id=TX-${bank}-${this.sequence}; correlation_id=CORR-${this.sequence}`);
      } else if(this.scenario==='thread_starvation') this.incident('CRITICAL','ACE Integration Server','WORKER_SATURATION: all worker threads busy; correlation_id=CORR-STARVE-'+this.sequence);
      else if(this.queue>200) this.incident('WARN','IBM MQ','MQ_BUFFER: queue depth critical; correlation_id=CORR-MQ-'+this.sequence);
      else this.incident('INFO','Payment Gateway',`FLOW_COMPLETED: tx_id=TX-QRIS-${this.sequence}; correlation_id=CORR-${this.sequence}`,`${Math.round(this.telemetry.system.global_tps*12)} payment messages finalized in the last 12 seconds.`);
      this.telemetry.latest_incidents=copy(this.incidents);
    }
    return this.getTelemetry();
  }
  private rebuild(advance:boolean){
    const jitter=Math.sin(this.ticks*.31)*1.8;
    const outage=this.scenario==='bni_timeout'?'BNI':this.scenario==='bca_outage'?'BCA':null;
    const starved=this.scenario==='thread_starvation';const flash=this.scenario==='flash_sale';
    const influx=this.scenario==='dlq_influx';
    const rateFactor=flash?3.25:starved?.19:1;
    const channels=channelIds.map((id,i)=>{
      const down=outage===id;
      const slow=starved || (flash && (id==='MANDIRI'||id==='BNI'));
      const latency=down?30000:Math.round(baseLatency[i]*(starved?19:flash?(slow?4.8:2):1)+Math.sin(this.ticks*.24+i)*12);
      const tps=down?0:round(Math.max(0,(baseTPS[i]+jitter*(i+1)/15)*rateFactor));
      const errors=down?100:round(starved?5.5+i*.6:influx?4.8+i*.5:flash?.8+i*.25:([.1,.2,.15,0,.3][i]),2);
      if(!down){this.attemptedLatency[id].push(latency);this.attemptedLatency[id]=this.attemptedLatency[id].slice(-60);}
      return {id,name:names[id],status:down?'DOWN' as const:slow?'DEGRADED' as const:'UP' as const,tps,latency_ms:latency,error_rate:errors};
    });
    const totalTPS=round(channels.reduce((s,c)=>s+c.tps,0));
    const delta=flash?45:starved?40:outage?(outage==='BCA'?19.4:5.5):influx?9:this.queue>0?-Math.min(3,this.queue):0;
    const ingestion=round(totalTPS+delta);
    if(advance){this.queue=Math.max(0,this.queue+ingestion-totalTPS);const finalized=Math.round(totalTPS);this.total+=finalized;const weightedFailure=channels.reduce((s,c)=>s+c.tps*c.error_rate/100,0);this.succeeded+=Math.max(0,finalized-weightedFailure);}
    const workers=starved||flash?10:outage?8:influx?9:6+Number(Math.sin(this.ticks*.2)>.75);
    const gc=this.ticks>0 && this.ticks%24===0;
    const floor=flash?72:starved?70:outage?57:52;
    const heap=round(Math.min(96,floor+(this.ticks%24)*.65));
    this.heapHistory.push({timestamp:this.clock(),value:heap,gc});this.heapHistory=this.heapHistory.slice(-120);
    const dbActive=flash?18:starved?19:outage?14:11+Number(this.ticks%7===0);
    this.telemetry={timestamp:this.clock(),system:{status:starved?'OUTAGE':outage||flash||influx?'DEGRADED':'HEALTHY',global_tps:totalTPS,success_rate:round(this.total?this.succeeded/this.total*100:100,2),total_today:this.total,active_threads:workers,max_threads:10,heap_memory_pct:heap,db_pool_active:dbActive,db_pool_max:20},channels,queues:{inbound_depth:Math.round(this.queue),dlq_count:this.items.length,recent_dlq_items:copy(this.items)},latest_incidents:copy(this.incidents)};
    const p95=Object.fromEntries(channelIds.map(id=>{const sorted=[...this.attemptedLatency[id]].sort((a,b)=>a-b);return [id,sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null];})) as Diagnostics['channel_p95_ms'];
    this.diagnostics={collected_at:this.clock(),data_mode:'mock',source_status:'fresh',channel_p95_ms:p95,ingestion_tps:ingestion,consumption_tps:totalTPS,db_pool_idle:20-dbActive,heap_history:copy(this.heapHistory),scenario:this.scenario};
  }
  private incident(level:Incident['level'],service:string,raw:string,message?:string){
    this.incidents.unshift({id:`INC-${this.sequence++}`,timestamp:this.clock(),level,service,raw_code:raw,plain_message:message??translateBip(raw).message});this.incidents=this.incidents.slice(0,60);
  }
  private addDeadLetter(channel:ChannelId,now:Date){
    const tx=`TX-${channel}-${this.dateKey(now).replaceAll('-','')}-${this.sequence++}`;
    const payload={transaction_id:tx,correlation_id:`CORR-${this.sequence}`,amount:150000,currency:'IDR',customer_id:'DEMO-CUSTOMER',channel,attempts:3,idempotency_key:tx};
    this.payloads.set(tx,payload);this.items.unshift({tx_id:tx,timestamp:now.toISOString(),channel,reason:'SocketTimeoutException: 30000ms',payload_snippet:JSON.stringify(payload)});
  }
  ping(id:ChannelId):ActionResult{
    const channel=this.telemetry.channels.find(c=>c.id===id);if(!channel)return {ok:false,message:'Unknown payment channel.'};
    const ok=channel.status!=='DOWN';this.incident(ok?'INFO':'WARN',`${id} health probe`,ok?`PROBE_OK: channel=${id}`:`BIP2230E: SocketTimeoutException HTTP_${id}_Call timeout=30000ms`,ok?`${id} responded to the simulated health probe in ${channel.latency_ms}ms.`:undefined);
    this.telemetry.latest_incidents=copy(this.incidents);
    return {ok,message:ok?`${id} simulated probe: ${channel.latency_ms} ms (${channel.status==='DEGRADED'?'slow response':'reachable'}).`:`${id} simulated probe timed out after 30 seconds.`};
  }
  getPayload(txId:string):Record<string,unknown>{if(!this.items.some(i=>i.tx_id===txId))throw new Error('Message not found. It may already have been handled.');return copy(this.payloads.get(txId)!);}
  retry(txId:string):ActionResult{
    if(this.retired.has(txId))return {ok:false,message:'This message has already been handled. Duplicate replay blocked.'};
    const item=this.items.find(i=>i.tx_id===txId);if(!item)return {ok:false,message:'Message not found.'};
    if(this.telemetry.channels.find(c=>c.id===item.channel)?.status==='DOWN')return {ok:false,message:`${item.channel} is unavailable. Restore the partner before retrying this payment.`};
    this.items=this.items.filter(i=>i.tx_id!==txId);this.retired.add(txId);this.queue++;
    this.incident('INFO','DLQ Manager',`RESOLVED: tx_id=${txId}; correlation_id=CORR-REPLAY-${this.sequence}`,`${txId} was moved to the simulated inbound queue with its idempotency key preserved.`);
    this.syncActions();return {ok:true,message:`${txId} requeued once. No real payment was sent.`};
  }
  discard(txId:string):ActionResult{
    if(this.retired.has(txId))return {ok:false,message:'This message has already been handled.'};
    if(!this.items.some(i=>i.tx_id===txId))return {ok:false,message:'Message not found.'};
    this.items=this.items.filter(i=>i.tx_id!==txId);this.retired.add(txId);this.payloads.delete(txId);
    this.incident('INFO','DLQ Manager',`RESOLVED: tx_id=${txId}; action=discard`,`${txId} was discarded from the demo dead-letter queue.`);
    this.syncActions();return {ok:true,message:`${txId} discarded from the demo queue.`};
  }
  private syncActions(){this.telemetry.queues={inbound_depth:Math.round(this.queue),dlq_count:this.items.length,recent_dlq_items:copy(this.items)};this.telemetry.latest_incidents=copy(this.incidents);}
}
