import { useEffect, useId, useRef, useState } from 'react'
import { Hand, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import type { Diagnostics, Telemetry } from '../../shared/types'

export type TownSelection = { type: 'apps' | 'workshop' | 'queue' | 'channel' | 'worker'; id?: string }

type Props = { telemetry: Telemetry; diagnostics: Diagnostics | null; onInspect: (selection: TownSelection) => void }
type Hit = TownSelection & { x: number; y: number; w: number; h: number; label: string; detail: string }
type Point = { x: number; y: number }
type Ctx = CanvasRenderingContext2D

const W = 1280
const H = 620
const COLORS = { ink: '#253c36', muted: '#586c57', grass: '#b5c890', grass2: '#a9be80', grass3: '#c4d29e', road: '#e5d1a8', roadEdge: '#bcad83', wood: '#907454', woodLight: '#c3a16a', paper: '#fff8e5', green: '#2e8767', amber: '#bc7b24', red: '#c5594d', water: '#82b6b8' }
const CHANNELS = ['BCA', 'MANDIRI', 'BNI', 'ASTRAPAY', 'QRIS']
const LABELS = ['BCA', 'MANDIRI', 'BNI', 'ASTRAPAY', 'QRIS']
const CHANNEL_COLORS = ['#558893', '#9c8760', '#6d869d', '#9f7d9d', '#6f987a']
const DOCK_Y = [116, 217, 318, 419, 520]
const key = (selection: TownSelection | null) => selection ? `${selection.type}:${selection.id ?? ''}` : ''
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
const statusColor = (status: string) => status === 'UP' || status === 'HEALTHY' ? COLORS.green : status === 'DOWN' || status === 'OUTAGE' ? COLORS.red : COLORS.amber

function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }
function line(c: Ctx, points: number[], color: string, width = 2) { c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.strokeStyle = color; c.lineWidth = width; c.stroke() }
function polygon(c: Ctx, points: number[], color: string) { c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.closePath(); c.fillStyle = color; c.fill() }
function text(c: Ctx, value: string, x: number, y: number, size = 12, color = COLORS.ink, align: CanvasTextAlign = 'left', weight = 600) { c.font = `${weight} ${size}px "Inter", "Segoe UI", sans-serif`; c.fillStyle = color; c.textAlign = align; c.fillText(value, x, y) }
function round(c: Ctx, x: number, y: number, w: number, h: number, color: string, radius = 7) { c.beginPath(); c.roundRect(x, y, w, h, radius); c.fillStyle = color; c.fill() }
function shadow(c: Ctx, x: number, y: number, w: number, h = 8) { c.save(); c.globalAlpha = .12; round(c, x, y, w, h, '#2f5038', h / 2); c.restore() }

function tree(c: Ctx, x: number, y: number, scale = 1, variation = 0) {
  c.save(); c.translate(x, y); c.scale(scale, scale)
  shadow(c, -23, 18, 54, 13)
  rect(c, -5, 4, 10, 25, '#82684e'); rect(c, -5, 12, 4, 17, '#6e5845')
  const leaf = variation % 2 ? '#6c8d60' : '#7b9a66'
  polygon(c, [-12,-36,14,-36,14,-30,25,-30,25,-17,32,-17,32,5,24,5,24,15,-23,15,-23,6,-30,6,-30,-17,-23,-17,-23,-29,-12,-29], leaf)
  polygon(c, [-12,-36,14,-36,14,-30,25,-30,25,-18,5,-18,5,-10,-26,-10,-26,-21,-23,-21,-23,-29,-12,-29], variation % 2 ? '#82a16b' : '#95ae78')
  rect(c, -14, -23, 8, 5, '#b3c48a'); rect(c, 4, -30, 6, 4, '#b3c48a'); rect(c, 15, 4, 10, 5, '#608250')
  c.restore()
}

function bush(c: Ctx, x: number, y: number) { rect(c, x, y, 30, 10, '#86a468'); rect(c, x + 4, y - 5, 22, 8, '#93ad71'); rect(c, x + 6, y - 5, 7, 3, '#b8c98b') }
function flower(c: Ctx, x: number, y: number, color: string) { rect(c, x, y, 2, 6, '#7c9863'); rect(c, x - 2, y - 3, 6, 4, color); rect(c, x, y - 5, 2, 8, color); rect(c, x, y - 2, 2, 2, '#f7e4a4') }

function crate(c: Ctx, x: number, y: number, scale = 1, accent = '#c49658') {
  c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(scale, scale)
  rect(c, 0, 0, 18, 16, '#8b6b44'); rect(c, 2, 2, 14, 12, accent)
  line(c, [3,3,15,13], '#e9c888', 2); line(c, [3,13,15,3], '#e9c888', 2)
  rect(c, 0, 0, 18, 2, '#efd092'); rect(c, 0, 14, 18, 2, '#a27d4c'); rect(c, 18, 2, 4, 14, '#a17948')
  c.restore()
}

function person(c: Ctx, x: number, y: number, time: number, color = '#688d9e', working = false, tired = false) {
  const step = working ? Math.round(Math.sin(time * 6) * 2) : 0
  shadow(c, x - 9, y + 12, 19, 5)
  rect(c, x - 5, y + 5, 4, 8 + step, '#55605b'); rect(c, x + 2, y + 5, 4, 8 - step, '#55605b')
  rect(c, x - 6, y - 6, 13, 13, color); rect(c, x - 8, y - 2 - step, 3, 8, '#d9ac83'); rect(c, x + 7, y - 2 + step, 3, 8, '#d9ac83')
  rect(c, x - 5, y - 16, 10, 11, '#e4bd94'); rect(c, x - 6, y - 18, 12, 5, '#67503e'); rect(c, x - 7, y - 13, 15, 3, '#b79865')
  rect(c, x + 2, y - 10, 2, 2, '#594f40')
  if (tired) text(c, 'z', x + 12, y - 15 - Math.sin(time) * 2, 13, '#73838c', 'left', 800)
}

function flag(c: Ctx, x: number, y: number, color: string, time: number) {
  rect(c, x, y, 3, 42, '#796b51')
  const flutter = Math.round(Math.sin(time * 2) * 2)
  polygon(c, [x + 3,y,x + 26,y + flutter,x + 22,y + 7,x + 26,y + 14 + flutter,x + 3,y + 14], color)
  rect(c, x + 3, y + 2, 17, 3, '#ffffff35')
}

function plaque(c: Ctx, value: string, x: number, y: number, w: number, sub?: string) {
  shadow(c, x + 2, y + 3, w, sub ? 45 : 26)
  round(c, x, y, w, sub ? 45 : 27, COLORS.paper, 5)
  text(c, value, x + w / 2, y + 18, 11, COLORS.ink, 'center', 800)
  if (sub) text(c, sub, x + w / 2, y + 34, 10, '#737762', 'center', 500)
}

function pathPoint(progress: number, points: Point[]) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let remaining = progress * lengths.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) { const t = remaining / lengths[i]; return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t } }
    remaining -= lengths[i]
  }
  return points.at(-1)!
}

function drawLandscape(c: Ctx, t: number) {
  rect(c, 0, 0, W, H, COLORS.grass)
  for (let row = 0; row < 21; row++) for (let col = 0; col < 37; col++) {
    const seed = (row * 53 + col * 31) % 17
    if (seed < 5) rect(c, col * 30 + seed * 4, row * 30 + seed, 15 + seed, 2, seed % 2 ? '#a4bb7e' : '#c2d09b')
    if (seed === 6) { rect(c, col * 30 + 8, row * 30 + 6, 2, 5, '#91ab73'); rect(c, col * 30 + 11, row * 30 + 8, 2, 3, '#91ab73') }
  }
  // The eastern river uses hand-built stepped banks and animated pixel ripples.
  polygon(c, [1090,0,1280,0,1280,620,1076,620,1076,554,1085,554,1085,450,1073,450,1073,360,1080,360,1080,280,1068,280,1068,180,1080,180,1080,80,1090,80], '#d8d5a7')
  polygon(c, [1102,0,1280,0,1280,620,1090,620,1090,554,1098,554,1098,450,1087,450,1087,360,1093,360,1093,280,1082,280,1082,180,1094,180,1094,80,1102,80], COLORS.water)
  for (let j = 0; j < 20; j++) {
    const x = 1104 + (j * 51 % 158)
    const y = (j * 47 + Math.sin(t * .7 + j) * 5) % 620
    rect(c, x, y, 15 + j % 11, 2, '#b3d3ce'); rect(c, x + 4, y + 5, 7, 2, '#95c5c2')
  }
  // Main cobbled road and the five dock approaches.
  line(c, [168,365,902,365], COLORS.roadEdge, 59)
  line(c, [168,365,902,365], COLORS.road, 51)
  line(c, [896,114,896,534], COLORS.roadEdge, 47)
  line(c, [896,114,896,534], COLORS.road, 41)
  for (const y of DOCK_Y) { line(c, [896,y + 17,1030,y + 17], COLORS.roadEdge, 35); line(c, [896,y + 17,1030,y + 17], COLORS.road, 29) }
  line(c, [167,242,167,435], COLORS.roadEdge, 52); line(c, [167,242,167,435], COLORS.road, 46)
  for (let i = 0; i < 45; i++) { const x = 162 + i * 16; rect(c, x, 344 + i % 4 * 9, 7, 3, '#c9b88e') }
  for (let i = 0; i < 26; i++) rect(c, 879 + i % 3 * 12, 128 + i * 15, 5, 3, '#c9b88e')
  // Orchard, flower beds and a hand-laid fence frame the useful scene.
  for (const [x,y,s] of [[28,85,1.2],[96,93,1],[39,159,.85],[302,94,1],[352,60,.8],[743,82,1.1],[814,113,.75],[38,525,1],[96,558,.95],[271,528,.9],[733,545,1.1],[796,578,.75],[26,603,.8]]) tree(c, x, y, s, x % 3)
  for (const [x,y] of [[75,139],[299,133],[365,109],[746,123],[272,575],[698,547],[840,559],[1027,594]]) bush(c,x,y)
  for (let i = 0; i < 35; i++) { const x = 64 + (i * 47 % 752), y = i % 2 ? 477 + i % 5 * 17 : 143 + i % 3 * 16; flower(c, x,y, ['#f0d18f','#efe7cb','#d59881'][i % 3]) }
  for (let x = 350; x < 735; x += 24) { rect(c, x, 488, 5, 29, '#b3986f'); rect(c, x + 1, 486, 3, 4, '#ddc49b') }
  rect(c, 350, 495, 389, 4, '#c3a77a'); rect(c, 350, 508, 389, 4, '#c3a77a')
  text(c, 'N', 1234, 42, 10, '#476f75', 'center', 800)
  polygon(c, [1234,51,1229,65,1234,61,1239,65], '#d1e2cf')
}

function drawOrigins(c: Ctx, t: number, telemetry: Telemetry, hits: Hit[]) {
  shadow(c, 82, 302, 191, 23)
  rect(c, 94, 225, 161, 74, '#eadaba'); rect(c, 247, 225, 9, 74, '#c5b394')
  rect(c, 101, 232, 147, 4, '#f5e8ce')
  polygon(c, [80,228,104,189,244,189,269,228], '#739889'); rect(c, 84,225,181,8,'#567d70')
  for (let j = 0; j < 6; j++) line(c, [104+j*24,195,93+j*30,224], '#94afa0',2)
  rect(c, 153,248,33,51,'#866e53'); rect(c, 158,253,23,41,'#625e4a'); rect(c, 173,271,4,4,'#e0bb74')
  for (const x of [109,206]) { rect(c,x,249,26,26,'#aa9470'); rect(c,x+3,252,20,20,'#a7c4b6'); rect(c,x+12,252,2,20,'#f2e4c4'); rect(c,x+3,261,20,2,'#f2e4c4') }
  plaque(c,'TOWN SQUARE',111,171,127)
  plaque(c,'WEB + MOBILE',92,312,170,`${telemetry.system.global_tps.toFixed(1)} transactions / sec`)
  // Couriers emerge from the app building at a rate tied to live TPS.
  const flow = Math.max(.13, Math.min(1.8, telemetry.system.global_tps / 60))
  const couriers = telemetry.system.global_tps > 0 ? Math.min(5, Math.max(1, Math.ceil(telemetry.system.global_tps / 30))) : 0
  for (let i = 0; i < couriers; i++) {
    const p = ((t * .065 * flow + i / couriers) % 1)
    const at = pathPoint(p,[{x:174,y:300},{x:174,y:370},{x:358,y:370}])
    person(c,at.x,at.y-6,t+i,['#8b9e77','#bd9b67','#7597a1'][i%3],true)
    crate(c,at.x+11,at.y-8,.65)
    hits.push({type:'apps',id:`courier-${i+1}`,x:at.x-12,y:at.y-25,w:42,h:44,label:'Application delivery courier',detail:`${telemetry.system.global_tps.toFixed(1)} TPS arriving from web and mobile apps`})
  }
  // Two quiet benches and a town notice board.
  rect(c,90,415,42,10,'#ab865b'); rect(c,94,425,4,10,'#7e6950'); rect(c,123,425,4,10,'#7e6950')
  rect(c,210,404,5,34,'#8c7857'); rect(c,246,404,5,34,'#8c7857'); rect(c,205,393,51,30,'#bea070'); rect(c,209,397,43,21,'#e9dcad')
  text(c,'INTERNAL',230,406,6,'#74634b','center',800); text(c,'APPS',230,415,7,'#74634b','center',800)
  person(c,115,407,t,'#9a808c',false)
  hits.push({type:'apps',x:79,y:169,w:192,h:270,label:'Internal applications',detail:`${telemetry.system.global_tps.toFixed(1)} TPS · web & mobile origins`})
}

function drawWorkshop(c: Ctx, t: number, telemetry: Telemetry, hits: Hit[]) {
  const s = telemetry.system
  const saturated = s.active_threads / Math.max(s.max_threads, 1) > .85
  const failed = telemetry.channels.filter(ch => ch.status !== 'UP')
  shadow(c,365,414,338,24)
  rect(c,367,224,326,186,'#8e7657'); rect(c,375,226,310,173,'#e3ceb0')
  rect(c,389,244,282,147,'#f0dfbf')
  // Open front workshop with a cutaway roof, floorboards and ten visible benches.
  for (let j=0;j<10;j++) rect(c,389,246+j*15,282,1,'#cbb693')
  for (let j=0;j<5;j++) rect(c,391+j*57,246,1,145,'#dbc6a4')
  rect(c,358,398,346,10,'#b1936a'); rect(c,362,408,338,8,'#d5b98b'); rect(c,365,416,332,5,'#a28965')
  rect(c,378,238,10,161,'#b18b5a'); rect(c,672,238,10,161,'#b18b5a')
  polygon(c,[351,241,391,180,673,180,715,241],'#ae6e58')
  polygon(c,[391,180,673,180,680,191,384,191],'#c58a6a')
  for (let i=0;i<4;i++) line(c,[378-i*7,197+i*10,685+i*7,197+i*10],'#be8163',2)
  for(let j=0;j<10;j++) line(c,[397+j*28,190,379+j*32,238],'#985e4f',1)
  rect(c,350,238,365,8,'#865b4a')
  rect(c,626,158,24,44,'#9b7d66'); rect(c,620,155,36,9,'#bca087'); rect(c,628,162,6,29,'#c3a187')
  const smokeSpeed = clamp(s.global_tps/65,.2,2.7)
  for(let i=0;i<4;i++) { const phase=(t*.2*smokeSpeed+i*.24)%1; c.save(); c.globalAlpha=(1-phase)*.42; const size=10+phase*22; rect(c,634+Math.sin(phase*5)*13-size/2,151-phase*72,size,size,'#eff1d9'); rect(c,640+Math.sin(phase*5)*13-size/2,147-phase*72,size-4,size-4,'#e5e9d0'); c.restore() }
  flag(c,688,153,statusColor(s.status),t)
  plaque(c,'IBM ACE WORKSHOP',416,205,225)
  hits.push({type:'workshop',x:350,y:153,w:365,h:284,label:'IBM ACE integration server',detail:`${s.active_threads}/${s.max_threads} active workers · ${s.heap_memory_pct.toFixed(0)}% heap`})
  // Each real worker has a bench. Higher configured capacities pack the room more closely.
  const columns = Math.max(5, Math.ceil(Math.sqrt(s.max_threads * 2.5)))
  const rows = Math.max(2, Math.ceil(s.max_threads / columns))
  const cellW = 280 / columns, cellH = 146 / rows, benchScale = Math.min(1, cellW / 53, cellH / 67)
  for(let i=0;i<s.max_threads;i++) {
    const x=390+cellW*((i%columns)+.5), y=249+cellH*(Math.floor(i/columns)+.4)
    const active = i<s.active_threads
    const exists = true
    const warning = active && (saturated || i<failed.length)
    c.save(); c.translate(x, y); c.scale(benchScale, benchScale); c.translate(-x,-y)
    rect(c,x-18,y+15,38,12,exists?'#ba9667':'#cfb899'); rect(c,x-15,y+27,4,8,'#9a7b55'); rect(c,x+13,y+27,4,8,'#9a7b55')
    rect(c,x-18,y+15,38,3,'#d7b681')
    if(exists) {
      person(c,x,y+1,t+i,['#6c9295','#9b9970','#b89569','#928293','#799e81'][i%5],active,!active)
      if(active) { crate(c,x+5,y+9,.6); rect(c,x-9,y+12,7,3,'#587c79'); rect(c,x-7,y+6,3,9,'#d0c7a1') }
      else { rect(c,x-5,y+10,12,4,'#d6c6a2') }
      if(warning) { const y1=y-24+(Math.sin(t*4+i)>0?-1:1); round(c,x-7,y1-10,15,18,COLORS.amber,3); text(c,'!',x+.5,y1+3,13,'#fff8db','center',900) }
      hits.push({type:'worker',id:String(i+1),x:x-23*benchScale,y:y-20*benchScale,w:48*benchScale,h:57*benchScale,label:`Worker ${i+1} · ${active?'busy':'available'}`,detail:warning?'Waiting on a slow route · inspect telemetry':active?'Processing transactions at this workbench':'Ready for incoming transactions'})
    }
    c.restore()
  }
  plaque(c,`${s.active_threads} / ${s.max_threads} CRAFTSMEN BUSY`,402,437,263,saturated?'Capacity warning · more than 85% occupied':'Live worker occupancy')
  // Workshop supplies and a small pressure furnace.
  crate(c,327,391,.85); crate(c,309,401,.7); rect(c,708,344,28,38,'#889087'); rect(c,710,340,24,7,'#b3b59b'); rect(c,715,351,14,19,'#715f4c'); rect(c,719,359,7,9,s.heap_memory_pct>85?'#dd784c':'#d8aa58')
  text(c,`${s.heap_memory_pct.toFixed(0)}%`,722,395,9,'#55634e','center',800)
}

function drawSilo(c: Ctx, t: number, telemetry: Telemetry, hits: Hit[]) {
  const depth=telemetry.queues.inbound_depth, fill=clamp(depth/250), color=depth>200?COLORS.red:depth>50?COLORS.amber:COLORS.green
  shadow(c,763,349,109,16)
  rect(c,776,236,84,109,'#d9d1ad'); rect(c,778,240,10,101,'#eeead0'); rect(c,849,240,11,101,'#afa889')
  polygon(c,[768,239,785,216,848,216,868,239],'#739496'); rect(c,779,218,69,4,'#92adb0')
  rect(c,774,252,88,5,'#98a797'); rect(c,774,321,88,5,'#98a797')
  rect(c,798,253,32,77,'#6d8173'); rect(c,801,256,26,71,'#a9bbb0')
  if(depth>0) { const height=Math.max(4,fill*69); rect(c,801,327-height,26,height,'#d4b76e'); rect(c,801,327-height,26,3,'#edcf83'); for(let i=0;i<6;i++) rect(c,804+i%3*7,325-i*5,3,2,'#b79552') }
  for(let i=0;i<5;i++) rect(c,831,265+i*12,5,1,'#897f61')
  rect(c,768,344,101,8,'#a89d77'); rect(c,803,332,23,16,'#7a7157')
  flag(c,856,202,color,t)
  plaque(c,'IBM MQ SILO',758,179,124)
  plaque(c,`${depth.toLocaleString()} WAITING`,754,381,138,depth>200?'Overflow · critical':depth>50?'Backlog growing':'Buffer healthy')
  if(depth>200) { for(let i=0;i<8;i++) crate(c,756+i%4*24,341+Math.floor(i/4)*18,.8); text(c,'!',818,235,15,'#ffe9b9','center',900) }
  // The reject crate is visible near the silo, with a distinct red delivery slip.
  rect(c,772,458,79,37,'#a3815c'); rect(c,775,461,73,29,'#836c51'); rect(c,780,465,63,24,'#b89565')
  if(telemetry.queues.dlq_count>0) { crate(c,780,450,.8); crate(c,812,454,.7); rect(c,787,450,7,11,'#d57a65') }
  rect(c,771,481,80,5,'#d0ab76'); plaque(c,`${telemetry.queues.dlq_count} IN REJECT BIN`,751,502,144)
  hits.push({type:'queue',x:751,y:179,w:133,h:249,label:'IBM MQ inbound buffer',detail:`${depth} messages waiting · ${depth>200?'critical':depth>50?'warning':'normal'} depth`})
  hits.push({type:'queue',id:'dlq',x:749,y:448,w:147,h:85,label:'Dead letter queue',detail:`${telemetry.queues.dlq_count} failed messages · inspect, retry or discard`})
}

function drawDocks(c: Ctx, t: number, telemetry: Telemetry, hits: Hit[]) {
  CHANNELS.forEach((id,index)=>{
    const ch=telemetry.channels.find(channel=>channel.id===id)
    if(!ch) return
    const y=DOCK_Y[index], offline=ch.status==='DOWN', slow=ch.status==='DEGRADED', color=statusColor(ch.status)
    // Timber piers sit on pylons above the water.
    shadow(c,1000,y+28,181,13)
    rect(c,998,y+4,180,42,'#967b57'); rect(c,1000,y+3,177,35,'#c1a473')
    for(let x=1003;x<1177;x+=14) { rect(c,x,y+4,1,33,'#927b58'); rect(c,x+2,y+6,9,2,'#d4bb8c') }
    for(const x of [1001,1158]) { rect(c,x,y-1,7,10,'#e0c797'); rect(c,x,y+38,7,13,'#806e52'); rect(c,x-1,y+35,9,6,'#dec595') }
    // Trading house and its stateful gate.
    rect(c,945,y-27,83,54,'#e7d9b8'); rect(c,945,y-27,7,54,'#cbb793'); rect(c,1023,y-27,6,54,'#b9a581')
    polygon(c,[935,y-26,950,y-49,1022,y-49,1038,y-26],CHANNEL_COLORS[index]); rect(c,936,y-26,101,5,'#57695d')
    rect(c,957,y-17,59,42,'#7b775e')
    if(offline||slow) {
      const height=offline?38:16
      rect(c,957,y-17,59,height,offline?'#938c7d':'#b99b6d')
      for(let n=0;n<height;n+=7) rect(c,959,y-15+n,55,2,'#756e63')
      rect(c,975,y+(offline?-5:-17),24,12,offline?'#d7cdb3':'#d3ba86')
      text(c,offline?'CLOSED':'SLOW',987,y+(offline?3:-9),6,'#695c4c','center',900)
    } else { rect(c,965,y-9,18,23,'#879a79'); rect(c,990,y-5,16,19,'#bea076'); crate(c,998,y+8,.6) }
    person(c,1047,y+17,t+index,CHANNEL_COLORS[index],!offline&&!slow,offline||slow)
    flag(c,1025,y-61,color,t+index)
    // Five individual small merchant ships, each with its own channel pennant.
    const bob=offline?0:Math.round(Math.sin(t*1.6+index)*2), boatX=1197
    polygon(c,[boatX-14,y+15+bob,boatX+60,y+15+bob,boatX+49,y+33+bob,boatX-3,y+33+bob],'#7e6754')
    rect(c,boatX-8,y+11+bob,58,7,'#d8bb88'); rect(c,boatX+13,y-27+bob,3,40,'#836e54')
    polygon(c,[boatX+17,y-26+bob,boatX+17,y+6+bob,boatX+47,y+6+bob],offline?'#b9c8bb':'#f4ead2')
    polygon(c,[boatX+11,y-22+bob,boatX-7,y+6+bob,boatX+11,y+6+bob],CHANNEL_COLORS[index])
    crate(c,boatX+25,y+4+bob,.55)
    round(c,951,y-51,78,21,COLORS.paper,4)
    text(c,LABELS[index],990,y-37,10,COLORS.ink,'center',800)
    round(c,1061,y+41,201,23,'#f6f0dced',5)
    rect(c,1069,y+49,6,6,color)
    text(c,`${ch.tps.toFixed(1)} TPS`,1083,y+56,10,COLORS.ink)
    text(c,offline?'OFFLINE':`${Math.round(ch.latency_ms).toLocaleString()} ms`,1252,y+56,10,color,'right',700)
    if(offline) { crate(c,915,y+24,.85); crate(c,925,y+7,.8) }
    // Flow crosses the shared path, turns toward its bank, and ends at the gate.
    if(ch.tps>0&&!offline) {
      const count=Math.min(3,Math.max(1,Math.ceil(ch.tps/20)))
      const speed=clamp(180/Math.max(ch.latency_ms,80),.12,1.7)
      for(let n=0;n<count;n++) {
        const p=(t*.065*speed+index*.19+n/count)%1
        const at=pathPoint(p,[{x:708,y:366},{x:896,y:366},{x:896,y:y+20},{x:980,y:y+20}])
        rect(c,at.x-7,at.y+4,25,4,'#a88b60'); rect(c,at.x-4,at.y+8,5,5,'#655d4d'); rect(c,at.x+12,at.y+8,5,5,'#655d4d')
        crate(c,at.x-3,at.y-9,.72,CHANNEL_COLORS[index])
        hits.push({type:'channel',id,x:at.x-10,y:at.y-16,w:35,h:33,label:`${ch.name} delivery cart`,detail:`${ch.tps.toFixed(1)} TPS · ${Math.round(ch.latency_ms)} ms average journey`})
      }
    }
    hits.push({type:'channel',id,x:938,y:y-35,w:328,h:100,label:ch.name,detail:`${ch.status==='UP'?'Online':offline?'Offline':'Slow'} · ${ch.tps.toFixed(1)} TPS · ${Math.round(ch.latency_ms)} ms · ${ch.error_rate.toFixed(1)}% errors`})
    hits.push({type:'channel',id,x:938,y:y-61,w:110,h:26,label:ch.name,detail:`${ch.status==='UP'?'Online':offline?'Offline':'Slow'} · ${ch.tps.toFixed(1)} TPS · ${Math.round(ch.latency_ms)} ms · ${ch.error_rate.toFixed(1)}% errors`})
  })
}

function paint(c: Ctx, telemetry: Telemetry, t: number, hover: Hit | null): Hit[] {
  drawLandscape(c,t)
  text(c,'THE PAYMENT VILLAGE',42,36,11,'#4d674c','left',800)
  text(c,'Every delivery tells a story.',42,57,12,'#6e8160','left',500)
  text(c,'PARTNER HARBOUR',960,28,10,'#4d674c','left',800)
  const hits: Hit[]=[]
  drawOrigins(c,t,telemetry,hits); drawWorkshop(c,t,telemetry,hits); drawSilo(c,t,telemetry,hits); drawDocks(c,t,telemetry,hits)
  // A small garden shows this is a living place, not an unlabeled flow chart.
  for(let row=0;row<3;row++) {
    rect(c,398,537+row*12,225,8,'#a5aa71')
    for(let col=0;col<13;col++) { rect(c,403+col*17,533+row*12,4,9,'#819e5a'); rect(c,400+col*17,535+row*12,10,3,'#94ac64') }
  }
  text(c,'FLOWSTEAD · LIVE SYSTEM MODEL',42,597,9,'#6f825c','left',700)
  if(hover) {
    c.save(); c.strokeStyle='#fff7ce'; c.lineWidth=3; c.setLineDash([7,5]); c.strokeRect(hover.x-5,hover.y-4,hover.w+10,hover.h+8); c.restore()
    const updated=hits.find(hit=>key(hit)===key(hover))??hover
    c.font='500 11px "Inter", "Segoe UI", sans-serif'
    const width=Math.min(440,Math.max(235,c.measureText(updated.detail).width+30))
    const x=clamp(hover.x,12,W-width-12),y=Math.max(66,hover.y-64)
    shadow(c,x+2,y+5,width,50); round(c,x,y,width,50,'#203c34f5',7)
    text(c,updated.label,x+13,y+20,12,'#fff5dc','left',700)
    text(c,updated.detail,x+13,y+38,10,'#bdcebb','left',500)
  }
  return hits
}

export default function LivingTownCanvas({ telemetry, onInspect }: Props) {
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const frameRef=useRef<HTMLDivElement>(null)
  const telemetryRef=useRef(telemetry)
  const onInspectRef=useRef(onInspect)
  const hitRef=useRef<Hit[]>([])
  const hoverRef=useRef<Hit|null>(null)
  const pausedRef=useRef(false)
  const [paused,setPaused]=useState(false)
  const [zoom,setZoom]=useState(1)
  const [reducedMotion,setReducedMotion]=useState(false)
  const [worker,setWorker]=useState('1')
  const descriptionId=useId()
  telemetryRef.current=telemetry
  onInspectRef.current=onInspect
  pausedRef.current=paused

  useEffect(()=>{
    const canvas=canvasRef.current, frame=frameRef.current
    if(!canvas||!frame) return
    const c=canvas.getContext('2d')
    if(!c) return
    let raf=0,last=0,time=0,width=frame.clientWidth,dpr=Math.min(window.devicePixelRatio||1,2)
    const media=window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduce=media.matches
    setReducedMotion(reduce)
    const mediaChange=()=>{ reduce=media.matches; setReducedMotion(reduce) }
    media.addEventListener('change',mediaChange)
    const resize=()=>{
      width=frame.clientWidth
      dpr=Math.min(window.devicePixelRatio||1,2)
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(width*H/W*dpr)
      canvas.style.width=`${width}px`; canvas.style.height=`${width*H/W}px`
    }
    const observer=new ResizeObserver(resize); observer.observe(frame); resize()
    const draw=(now:number)=>{
      const dt=last?Math.min((now-last)/1000,.05):0; last=now
      if(!pausedRef.current&&!reduce&&document.visibilityState==='visible') time+=dt
      c.setTransform(width/W*dpr,0,0,width/W*dpr,0,0); c.imageSmoothingEnabled=false
      hitRef.current=paint(c,telemetryRef.current,time,hoverRef.current)
      raf=requestAnimationFrame(draw)
    }
    raf=requestAnimationFrame(draw)
    const location=(event:MouseEvent)=>{ const box=canvas.getBoundingClientRect(); return {x:(event.clientX-box.left)/box.width*W,y:(event.clientY-box.top)/box.height*H} }
    const getHit=(point:Point)=>{
      // Narrow worker hitboxes win over the workshop they live inside.
      const all=hitRef.current.filter(h=>point.x>=h.x&&point.x<=h.x+h.w&&point.y>=h.y&&point.y<=h.y+h.h)
      return all.find(h=>h.type==='worker')??all.at(-1)??null
    }
    const move=(event:PointerEvent)=>{ hoverRef.current=getHit(location(event)); canvas.style.cursor=hoverRef.current?'pointer':'default' }
    const leave=()=>{ hoverRef.current=null; canvas.style.cursor='default' }
    const click=(event:MouseEvent)=>{ const hit=getHit(location(event)); if(hit) onInspectRef.current({type:hit.type,id:hit.id}) }
    canvas.addEventListener('pointermove',move); canvas.addEventListener('pointerleave',leave); canvas.addEventListener('click',click)
    return()=>{ cancelAnimationFrame(raf); observer.disconnect(); media.removeEventListener('change',mediaChange); canvas.removeEventListener('pointermove',move); canvas.removeEventListener('pointerleave',leave); canvas.removeEventListener('click',click) }
  },[])

  const workerCount=telemetry.system.max_threads
  return <section className="living-town" aria-label="Living Town visual simulation">
    <style>{`
      .living-town { overflow:hidden; border:1px solid #334155; border-radius:16px; background:#152331; }
      .town-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:15px 20px; flex-wrap:wrap; }
      .town-title { color:#eff5f4; font-weight:700; font-size:14px; letter-spacing:-.2px; }
      .town-subtitle { color:#95a9b9; font-size:11px; margin-top:4px; line-height:1.5; }
      .town-tools { display:flex; gap:7px; align-items:center; }
      .town-control { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:32px; padding:6px 9px; color:#cad6df; background:#203243; border:1px solid #3a4b5a; border-radius:6px; cursor:pointer; font:inherit; font-size:11px; }
      .town-control:hover:not(:disabled),.town-control:focus-visible { background:#314758; border-color:#91b59f; color:#fff; }
      .town-control:focus-visible,.town-inspect:focus-visible { outline:2px solid #b5d1a1; outline-offset:3px; }
      .town-control:disabled { opacity:.4; cursor:not-allowed; }
      .town-zoom-label { color:#90a4b5; font-size:10px; min-width:34px; text-align:center; }
      .town-scroll { overflow-x:auto; background:#b5c890; scrollbar-color:#769369 #bed09c; }
      .town-canvas-wrap { min-width:980px; }
      .town-canvas-wrap canvas { display:block; image-rendering: auto; }
      .town-footer { display:flex; align-items:center; gap:8px 18px; flex-wrap:wrap; padding:12px 20px; border-top:1px solid #334155; color:#93a6b5; font-size:10px; }
      .town-legend { display:inline-flex; align-items:center; gap:6px; }
      .town-legend i { width:6px; height:6px; border-radius:50%; display:block; }
      .town-hint { display:inline-flex; align-items:center; gap:6px; margin-left:auto; }
      .town-accessible { display:flex; align-items:center; flex-wrap:wrap; gap:5px; padding:0 20px 13px; }
      .town-accessible-label { color:#8195a6; font-size:10px; margin-right:4px; }
      .town-inspect { color:#9fb2c0; background:transparent; border:1px solid #314555; border-radius:5px; padding:5px 7px; font:inherit; font-size:10px; cursor:pointer; }
      .town-inspect:hover { color:#e6f0df; border-color:#709280; background:#21392e; }
      select.town-inspect { max-width:86px; background:#152331; }
      @media(max-width:640px) { .town-toolbar { padding:14px; gap:10px; } .town-tools { width:100%; } .town-hint { margin-left:0; } .town-footer { padding:11px 14px; } .town-accessible { padding:0 14px 13px; } }
    `}</style>
    <div className="town-toolbar">
      <div><div className="town-title">A living picture of your payment network</div><div className="town-subtitle">Craftsmen are threads. Crates are transactions. Every dock is a partner.</div></div>
      <div className="town-tools">
        <button className="town-control" type="button" onClick={()=>setPaused(p=>!p)} aria-pressed={paused} disabled={reducedMotion} title={reducedMotion?'Animation follows your reduced motion preference':paused?'Resume visual animation':'Pause visual animation'}>{paused||reducedMotion?<Play size={12}/>:<Pause size={12}/>} {reducedMotion?'Reduced motion':paused?'Resume motion':'Pause motion'}</button>
        <button className="town-control" type="button" aria-label="Zoom out of town" onClick={()=>setZoom(z=>Math.max(1,Number((z-.25).toFixed(2))))} disabled={zoom<=1}><ZoomOut size={14}/></button>
        <span className="town-zoom-label">{Math.round(zoom*100)}%</span>
        <button className="town-control" type="button" aria-label="Zoom into town" onClick={()=>setZoom(z=>Math.min(1.75,Number((z+.25).toFixed(2))))} disabled={zoom>=1.75}><ZoomIn size={14}/></button>
      </div>
    </div>
    <div className="town-scroll"><div className="town-canvas-wrap" ref={frameRef} style={{width:`${zoom*100}%`}}><canvas ref={canvasRef} role="img" aria-label="Live payment village with internal app couriers, IBM ACE worker benches, MQ grain silo, and five partner trading docks. Use the inspect buttons below to open telemetry." aria-describedby={descriptionId}/></div></div>
    <div className="town-footer" id={descriptionId}>
      <span className="town-legend"><i style={{background:'#63b68c'}}/> Open gate · healthy</span>
      <span className="town-legend"><i style={{background:'#d1aa58'}}/> Tired worker · slow</span>
      <span className="town-legend"><i style={{background:'#d47a6b'}}/> Closed gate · offline</span>
      <span className="town-hint"><Hand size={12}/> Select any building or character to inspect · scroll to explore</span>
    </div>
    <div className="town-accessible" aria-label="Inspect town telemetry">
      <span className="town-accessible-label">INSPECT</span>
      <button type="button" className="town-inspect" onClick={()=>onInspect({type:'apps'})}>Internal apps</button>
      <button type="button" className="town-inspect" onClick={()=>onInspect({type:'workshop'})}>ACE workshop</button>
      <button type="button" className="town-inspect" onClick={()=>onInspect({type:'queue'})}>MQ silo</button>
      <button type="button" className="town-inspect" onClick={()=>onInspect({type:'queue',id:'dlq'})}>Reject bin</button>
      {CHANNELS.map((id,i)=><button type="button" key={id} className="town-inspect" onClick={()=>onInspect({type:'channel',id})}>{LABELS[i]}</button>)}
      <select className="town-inspect" value={worker} onChange={event=>setWorker(event.target.value)} aria-label="Choose worker to inspect">{Array.from({length:workerCount},(_,i)=><option key={i} value={String(i+1)}>Worker {i+1}</option>)}</select>
      <button type="button" className="town-inspect" onClick={()=>onInspect({type:'worker',id:worker})}>Inspect worker</button>
    </div>
  </section>
}
