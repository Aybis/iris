import { useId } from 'react'

type VillageProps = {
  scenario: 'outage' | 'healthy' | 'surge'
  paused: boolean
  onSelect: (partner: string) => void
}

function Tree({ x, y, size = 1, light = false }: { x: number; y: number; size?: number; light?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <ellipse cx="0" cy="18" rx="20" ry="6" fill="#647c50" opacity=".13" />
      <path d="M-4 1h8v23h-8z" fill="#907157" />
      <path d="M-4 16h4v8h-4z" fill="#715b46" />
      <path d="M-12-34h24v5h10v9h6v23h-7v8H-22V3h-6v-22h6v-10h10z" fill={light ? '#8da668' : '#6d895c'} />
      <path d="M-12-34h24v5h10v9H9v7H-21v-7h-1v-9h10z" fill={light ? '#a4ba7f' : '#819c6a'} />
      <path d="M-21-10h6v6h-6zm12-15h6v5h-6zM9-2h7v5H9z" fill={light ? '#becb91' : '#98af7c'} />
      <path d="M17-11h11V3h-7v8H-8V5h25z" fill="#506e48" opacity=".24" />
    </g>
  )
}

function Flower({ x, y, color = '#dcad72' }: { x: number; y: number; color?: string }) {
  return <g transform={`translate(${x} ${y})`}><path d="M0 1v6m0-2 3-2" stroke="#7e955f" strokeWidth="2" /><path d="M-2-3h4v2h2v4H2v2h-4V3h-2v-4h2z" fill={color} /><rect x="-1" y="0" width="2" height="2" fill="#f6e4aa" /></g>
}

function Crate({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${small ? '.75' : '1'})`}><path d="M0 0h17v15H0z" fill="#b59667" stroke="#8f7858" strokeWidth="1.5" /><path d="M2 2h13v11H2zM3 3l11 9M3 12l11-9" stroke="#d5b483" strokeWidth="2" fill="none" /><path d="M0 0l4-3h16l-3 3m0 0h3v12l-3 3" fill="#9e825d" stroke="#8f7858" strokeWidth="1" /></g>
}

function Courier({ x, y, shirt = '#f2d278', delay = '0s', animate = true }: { x: number; y: number; shirt?: string; delay?: string; animate?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="13" rx="8" ry="3" fill="#84775a" opacity=".18" />
      <g className={animate ? 'mm-v-courier' : undefined} style={{ animationDelay: delay }}>
        <path d="M-4 4h3v9h-4v-5h1zm5 0h3v9H0V8h1z" fill="#5e6967" />
        <path d="M-5-4h10v10H-5z" fill={shirt} />
        <path d="M-7-2h2v7h-2zM5-2h2v6H5z" fill="#cfa885" />
        <path d="M-4-11h8v7h-8z" fill="#d7b494" />
        <path d="M-5-12h9v3H-5zM-6-9h12v2H-6z" fill="#856d52" />
        <rect x="3" y="1" width="7" height="6" fill="#ba9763" /><path d="M6 1v6" stroke="#e3c799" strokeWidth="2" />
      </g>
    </g>
  )
}

function Stall({ x, y, name, accent, closed, warning = false, onSelect, id }: { x: number; y: number; name: string; accent: string; closed: boolean; warning?: boolean; onSelect: VillageProps['onSelect']; id: string }) {
  const statusColor = closed ? '#cc7963' : warning ? '#c5a04d' : '#81a66a'
  return (
    <g transform={`translate(${x} ${y})`}>
    <a
      href={`#${id}`}
      role="button"
      tabIndex={0}
      className="mm-v-bank"
      aria-label={`Inspect ${name}, ${closed ? 'partner offline' : warning ? 'slow responses' : 'operational'}`}
      onClick={event => { event.preventDefault(); onSelect(name) }}
      onKeyDown={event => { if (event.key === ' ') { event.preventDefault(); onSelect(name) } }}
    >
      <title>{name} · {closed ? 'Partner offline — inspect incident' : warning ? 'Slow responses — inspect route' : 'Operational — inspect route'}</title>
      <rect className="mm-v-focus" x="-53" y="-63" width="106" height="113" rx="12" fill="none" stroke="#6b7d51" strokeWidth="2" strokeDasharray="4 4" />
      <ellipse cx="4" cy="34" rx="49" ry="9" fill="#71865a" opacity=".15" />
      <path d="M-36-11h72v42h-72z" fill="#e8dcc0" stroke="#9a8c6f" strokeWidth="1.5" />
      <path d="M36-11h7v40l-7 2z" fill="#cab99a" />
      <path d="M-41-13h82l-9-24h-65z" fill={accent} />
      <path d="M-33-37h65l4 10h-73z" fill="#ffffff" opacity=".17" />
      <path d="M-41-13h82v7h-82z" fill={accent} />
      <path d="M-32-13h10v7h-10zm20 0h10v7h-10zm20 0h10v7H8zm20 0h10v7H28z" fill="#f0e9d6" opacity=".86" />
      <path d="M-36-6h5v40h-5zm67 0h5v40h-5z" fill="#8e795b" />
      {closed ? <g><path d="M-25-1h50v30h-50z" fill="#999083" /><path d="M-25 4h50m-50 6h50m-50 6h50m-50 6h50" stroke="#7e796f" strokeWidth="1.5" /><rect x="-18" y="6" width="36" height="14" rx="2" fill="#f0e4d0" /><text y="16" textAnchor="middle" fill="#9b6253" fontSize="7" fontWeight="800" letterSpacing=".8">CLOSED</text></g> : <g><path d="M-26-1h52v24h-52z" fill="#716b50" /><path d="M-19 0h12v15h-12z" fill="#aec1a0" /><path d="M-21 0h16v4h-16z" fill="#d8bf85" /><path d="M8 4h9v13H8z" fill="#d1af89" /><path d="M7 3h11v4H7z" fill="#7a6348" /><path d="M3 14h18v9H3z" fill="#b5b083" /><path d="M-29 20h58v6h-58z" fill="#b19166" /><path d="M-29 20h58v2h-58z" fill="#d4b383" /><rect x="-21" y="14" width="10" height="7" fill="#dbc295" /><path d="M-16 14v7" stroke="#a48b62" /></g>}
      <path d="M-39 31h79v5h-79z" fill="#b4aa88" />
      <path d="M33-40v-21" stroke="#766e52" strokeWidth="2" />
      <path d="M34-60h17v11H34z" fill={statusColor} />
      <path d="M34-60h17l-4 5h-13z" fill="#ffffff" opacity=".15" />
      <rect x="-35" y="-49" width="70" height="19" rx="3" fill="#fcf6e7" stroke="#b6a78b" strokeWidth="1" />
      <text y="-36" textAnchor="middle" fill="#4f5546" fontSize="11" fontWeight="750" letterSpacing={name === 'BCA' || name === 'BNI' ? '1' : '.1'}>{name}</text>
      <circle cx="-43" cy="-40" r="4" fill={statusColor} stroke="#f2f0df" strokeWidth="2" />
    </a>
    </g>
  )
}

export default function Village({ scenario, paused, onSelect }: VillageProps) {
  const uid = useId().replace(/:/g, '')
  const outage = scenario === 'outage'
  const surge = scenario === 'surge'

  return (
    <svg
      viewBox="0 0 960 320"
      xmlns="http://www.w3.org/2000/svg"
      role="group"
      aria-labelledby={`${uid}-title ${uid}-description`}
      className={`mm-village${paused ? ' mm-v-paused' : ''}${surge ? ' mm-v-surge' : ''}`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <title id={`${uid}-title`}>Your integration village</title>
      <desc id={`${uid}-description`}>A working village with a central integration workshop and four trading partners. Select BCA, Mandiri, BNI, or AstraPay to inspect a route.{outage ? ' BNI is closed because the partner is offline.' : surge ? ' Mandiri and BNI have slow responses, shown by amber flags. BCA and AstraPay are healthy.' : ' All trading partners are operational.'}{surge ? ' Extra couriers are carrying increased traffic.' : ''}</desc>
      <style>{`
        .mm-village { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .mm-v-bank { cursor: pointer; outline: none; }
        .mm-v-focus { opacity: 0; transition: opacity .2s; }
        .mm-v-bank:hover .mm-v-focus, .mm-v-bank:focus-visible .mm-v-focus { opacity: 1; }
        .mm-v-courier { animation: mm-v-walk 1.1s steps(2, end) infinite; }
        .mm-v-parcel { animation: mm-v-delivery 9s linear infinite; }
        .mm-v-smoke { animation: mm-v-drift 4s steps(8, end) infinite; transform-box: fill-box; transform-origin: center; }
        .mm-v-water { animation: mm-v-ripple 4s ease-in-out infinite; }
        .mm-v-paused *, .mm-v-paused .mm-v-courier, .mm-v-paused .mm-v-parcel { animation-play-state: paused !important; }
        .mm-v-surge .mm-v-parcel { animation-duration: 5s; }
        .mm-v-surge .mm-v-courier { animation-duration: .7s; }
        @keyframes mm-v-walk { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes mm-v-delivery { 0% { transform: translate(0, 0); opacity: 0; } 8% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translate(110px, -26px); opacity: 0; } }
        @keyframes mm-v-drift { 0% { opacity: .5; transform: translate(0, 0) scale(.7); } 100% { opacity: 0; transform: translate(5px, -17px) scale(1.3); } }
        @keyframes mm-v-ripple { 0%, 100% { opacity: .4; } 50% { opacity: .9; } }
        @media (prefers-reduced-motion: reduce) { .mm-village * { animation: none !important; } }
      `}</style>
      <defs>
        <pattern id={`${uid}-grass`} width="76" height="60" patternUnits="userSpaceOnUse">
          <path d="M12 18h3v3h-3zm45 21h2v2h-2zM26 49h4v2h-4z" fill="#a6b68e" opacity=".4" />
          <path d="m40 12 2 4 2-4m23 40 2 4 2-4" fill="none" stroke="#aec098" strokeWidth="1.4" />
        </pattern>
        <pattern id={`${uid}-roof`} width="19" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 11h19M9 0v5M0 5h19" fill="none" stroke="#9c6048" strokeWidth="1" opacity=".25" />
        </pattern>
      </defs>

      {/* The village green and footpaths. */}
      <path d="M0 0h960v320H0z" fill="#e0e7d4" />
      <path d="M0 0h960v320H0z" fill={`url(#${uid}-grass)`} />
      <path d="M0 266c110 18 185 0 264-17s138-20 211-7 151 34 230 22 142-44 255-20v76H0z" fill="#d3ddc3" opacity=".56" />
      <path d="M-20 196c110 0 209 4 278-18s127-8 209 5 135 4 198-14 156-8 315-2" fill="none" stroke="#cfc6a5" strokeWidth="38" />
      <path d="M-20 194c110 0 209 4 278-18s127-8 209 5 135 4 198-14 156-8 315-2" fill="none" stroke="#e9dcc0" strokeWidth="34" />
      <path d="M221 100c1 47 8 62 29 77M237 251c-1-39 8-58 31-75M716 91c8 37 6 50-23 74M744 254c-12-45-17-56-41-85M475 177v147" fill="none" stroke="#cfc6a5" strokeWidth="26" />
      <path d="M221 99c1 47 8 62 29 77M237 251c-1-39 8-58 31-75M716 90c8 37 6 50-23 74M744 253c-12-45-17-56-41-85M475 177v147" fill="none" stroke="#e9dcc0" strokeWidth="22" />
      <path d="M60 191h7m67 10h5m167-26h5m40 1h7m288-12h6m120 1h7m84 3h6M474 282h6m-252-75h5" stroke="#c7b693" strokeWidth="2" opacity=".55" />

      {/* A quiet pond, a little fence, and the growing beds. */}
      <path d="M30 266h8v-13h18v-9h42v6h19v12h12v25h-10v13H89v6H54v-8H35v-12h-5z" fill="#b9cbae" />
      <path d="M40 266h12v-12h43v7h18v12h7v13h-14v9H60v-6H44v-11h-4z" fill="#9fbfc0" />
      <path d="M54 270h23m15 13h15m-49 3h23" fill="none" stroke="#d6e4d5" strokeWidth="2" className="mm-v-water" />
      <path d="M97 265h10v5H97z" fill="#84a078" /><path d="M102 262h4v4h-4z" fill="#e5bfaa" />
      <path d="M826 256h91v45h-91z" fill="#b09b72" /><path d="M831 260h81v36h-81z" fill="#91886c" />
      {[0, 1, 2].map(row => <g key={row}>{[0, 1, 2, 3, 4].map(col => <g key={col} transform={`translate(${837 + col * 16} ${266 + row * 11})`}><path d="M0 0h7v5H0z" fill="#acb17b" /><path d="M2-3h3v8H2z" fill="#6e905b" /><path d="M-1-1h3v3h-3zm6 0h3v3H5z" fill="#89a568" /></g>)}</g>)}
      <g stroke="#a9a082" strokeWidth="3" fill="none"><path d="M800 278v-38m18 2v-11m20 5v-12m20 11v-13m20 13v-12m20 12v-12m20 14v-12M801 246l120-13m-120 23 120-13" /></g>
      <g stroke="#b5af92" strokeWidth="3" fill="none"><path d="M35 114v30m20-32v30m20-28v30m20-27v30M35 121l61 5m-61 6 61 5" /></g>

      {/* Back row planting gives the scene a soft skyline. */}
      <Tree x={50} y={72} size={1.04} />
      <Tree x={94} y={45} size={.85} light />
      <Tree x={136} y={81} size={.68} />
      <Tree x={327} y={42} size={.8} light />
      <Tree x={371} y={57} size={.6} />
      <Tree x={603} y={40} size={.87} />
      <Tree x={645} y={64} size={.67} light />
      <Tree x={857} y={71} size={1.05} light />
      <Tree x={905} y={98} size={.8} />
      <path d="M300 75h6v4h-6zm-16 12h8v4h-8zm360 15h9v4h-9z" fill="#b7c59e" />

      {/* The integration workshop. */}
      <ellipse cx="490" cy="204" rx="117" ry="14" fill="#71865a" opacity=".17" />
      <path d="M392 105h177v96H392z" fill="#eee1c2" stroke="#a99571" strokeWidth="2" />
      <path d="M569 105h13v91l-13 5z" fill="#c9b58e" stroke="#a99571" strokeWidth="1.5" />
      <path d="M392 180h177v21H392z" fill="#d7c8a7" />
      <path d="M397 189h14m7 0h18m82 0h17m8 0h20M407 197h19m109 0h18" stroke="#b9aa89" strokeWidth="1.3" />
      <path d="M544 46h15v33h-15z" fill="#a48d75" stroke="#826f59" strokeWidth="1.5" />
      <path d="M541 45h21v7h-21z" fill="#b39c82" />
      <g fill="#f5f4df"><rect className="mm-v-smoke" x="547" y="25" width="10" height="12" rx="2" /><rect className="mm-v-smoke" x="550" y="13" width="12" height="11" rx="2" style={{ animationDelay: '-2s' }} /></g>
      <path d="M379 106 407 60h144l32 46z" fill="#bd7959" stroke="#91664f" strokeWidth="2" strokeLinejoin="round" />
      <path d="M379 106 407 60h144l32 46z" fill={`url(#${uid}-roof)`} />
      <path d="M407 60h144l5 7H403z" fill="#d69570" />
      <path d="M379 106h204v9H379z" fill="#9f694f" /><path d="M382 106h198v3H382z" fill="#ddad80" />
      <path d="M468 81h24l12 18h-48z" fill="#e6d5b2" stroke="#90664f" strokeWidth="2" />
      <path d="M473 87h14v12h-14z" fill="#7e9986" /><path d="M480 87v12m-7-6h14" stroke="#e5dabc" strokeWidth="2" />
      <path d="M413 135h27v27h-27zm109 0h27v27h-27z" fill="#849d8d" stroke="#b29d75" strokeWidth="3" />
      <path d="M426 135v27m-13-14h27m96-13v27m-14-14h27" stroke="#ecdfbd" strokeWidth="3" />
      <path d="M409 163h35v5h-35zm109 0h35v5h-35z" fill="#a88863" />
      <path d="M451 145h53v56h-53z" fill="#8c7b5b" /><path d="M456 148h43v53h-43z" fill="#655f49" />
      <path d="M461 154h33v42h-33z" fill="#b49b70" /><path d="M478 154v42m-17-25h33" stroke="#84714e" strokeWidth="2" /><rect x="486" y="180" width="3" height="3" fill="#e9d09a" />
      <path d="M447 201h61v7h-61z" fill="#bbb18e" /><path d="M443 208h69v5h-69z" fill="#cdc3a2" />
      <rect x="415" y="118" width="131" height="20" rx="3" fill="#f9f2dd" stroke="#b7a07b" />
      <text x="480.5" y="131" fill="#76654e" textAnchor="middle" fontSize="8.4" fontWeight="800" letterSpacing="1.1">INTEGRATION WORKSHOP</text>
      <path d="M387 155v-38m0 2h-21v14h21" fill="#88a271" stroke="#78885a" strokeWidth="1.5" />
      <path d="M570 123h15v17h-15z" fill="#cbbb98" /><path d="M574 127h7v8h-7z" fill="#f5dca3" />
      <Crate x={398} y={185} /><Crate x={420} y={190} small /><Crate x={550} y={185} />
      <Flower x={410} y={179} color="#d4977e" /><Flower x={543} y={181} />

      <Stall x={221} y={105} name="BCA" accent="#779b9c" closed={false} onSelect={onSelect} id={`${uid}-bca`} />
      <Stall x={237} y={258} name="Mandiri" accent="#b4a469" closed={false} warning={surge} onSelect={onSelect} id={`${uid}-mandiri`} />
      <Stall x={717} y={96} name="BNI" accent={outage ? '#ad9281' : '#b98662'} closed={outage} warning={surge} onSelect={onSelect} id={`${uid}-bni`} />
      <Stall x={744} y={261} name="AstraPay" accent="#9a9d7a" closed={false} onSelect={onSelect} id={`${uid}-astrapay`} />

      {/* Couriers and small details bring the routes to life. */}
      <Courier x={301} y={170} delay="-.4s" />
      <Courier x={594} y={184} shirt="#839b9d" delay="-.8s" />
      <Courier x={478} y={253} shirt="#bd8c70" delay="-.2s" />
      <Courier x={805} y={177} shirt="#a1a67c" delay="-.6s" />
      <g transform="translate(265 165)"><g className="mm-v-parcel"><rect x="0" y="0" width="9" height="8" fill="#bc9d6f" stroke="#9a8059" /><path d="M4 0v8" stroke="#efd9ac" strokeWidth="2" /></g></g>
      {surge && <g><Courier x={355} y={185} shirt="#98a87f" delay="-.1s" /><Courier x={636} y={166} shirt="#ccac74" delay="-.5s" /><Courier x={468} y={296} shirt="#8aa2a0" /><Crate x={577} y={204} small /><Crate x={556} y={211} small /></g>}
      <Crate x={274} y={130} small /><Crate x={275} y={271} small />
      <Crate x={767} y={115} small /><Crate x={785} y={277} small />
      <g transform="translate(349 256)"><ellipse cx="0" cy="22" rx="25" ry="6" fill="#71865a" opacity=".12" /><path d="M-20-12h40v32h-40z" fill="#baa47c" stroke="#928264" strokeWidth="1.5" /><path d="M-23-12h46v7h-46z" fill="#d2bc8f" /><path d="M-14-4v22M-4-4v22M6-4v22M16-4v22" stroke="#a18a64" strokeWidth="2" /><rect x="-12" y="-19" width="12" height="9" fill="#b99067" transform="rotate(-10)" /><rect x="4" y="-17" width="13" height="9" fill="#c9ac7e" transform="rotate(8)" /><rect x="-14" y="1" width="28" height="11" rx="2" fill="#eee0be" /><text x="0" y="9" textAnchor="middle" fontSize="5.8" fontWeight="800" fill="#8b7353" letterSpacing=".5">PARCELS</text></g>
      <g transform="translate(622 260)"><path d="M-19-13h38v35h-38z" fill="#c0b18c" stroke="#9e9375" strokeWidth="1.5" /><path d="M-25-13 0-34l25 21z" fill="#a3946a" /><path d="M-25-13h50v5h-50z" fill="#8b825d" /><path d="M-13-5h26v20h-26z" fill="#b5a57d" /><path d="M-17 3h34M-17 12h34" stroke="#928663" /><path d="M-6 9H6v13H-6z" fill="#7f795a" /><path d="M-24 22h48v4h-48z" fill="#b5ad8d" /></g>
      <Tree x={92} y={224} size={.58} light /><Tree x={141} y={274} size={.82} />
      <Tree x={885} y={218} size={.75} /><Tree x={927} y={266} size={.8} light />
      <Tree x={55} y={319} size={.74} /><Tree x={555} y={321} size={.56} light />
      <Flower x={163} y={169} color="#d59b88" /><Flower x={173} y={173} />
      <Flower x={338} y={107} /><Flower x={349} y={115} color="#d59b88" />
      <Flower x={652} y={219} /><Flower x={662} y={224} color="#d59b88" />
      <Flower x={798} y={73} /><Flower x={804} y={80} color="#d59b88" />
      <Flower x={408} y={280} /><Flower x={416} y={285} color="#d59b88" />
      <path d="M129 43h7v4h-7m-13 6h5v4h-5m700 144h8v4h-8m-11 6h5v3h-5" fill="#b7c6a0" />
    </svg>
  )
}
