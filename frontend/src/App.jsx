import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { trilaterate } from './triangulation'
import { TopBar } from './components/Layout.jsx'
import RightPanel from './components/RightPanel'
import MiniMap from './components/MiniMap'
import CanvasControls from './components/CanvasControls'
import PlanAnchorsOverlay from './components/PlanAnchorsOverlay'
import DevicesOverlay from './components/DevicesOverlay'
import { useSvgPanZoom } from './hooks/useSvgPanZoom'
import AnchorsCard from './components/AnchorsCard'
import CalibrationHUD from './components/CalibrationHUD'
import Admin from './components/Admin'
import { Kalman2D } from './kalman'
import * as Mantine from '@mantine/core'
import { IconMapPin } from '@tabler/icons-react'

/*
 * App.jsx
 * Main application component for the Pinpoint frontend.
 *
 * Responsibilities:
 * - Maintain application state (anchors, factory size, polling state, smoothed positions)
 * - Fetch positions from the configured backend endpoint (mock or live)
 * - Convert per-router distance measurements into 2D positions using trilateration
 * - Provide an interactive UI for placing anchors and configuring factory dimensions
 */

function App(){
  // Max points to retain per device path history
  const MAX_PATH_POINTS = 1000
  const [apiKey, setApiKey] = useState('')
  const [useLive, setUseLive] = useState(false)
  // pollUrl controls the stream endpoint. We do NOT set a default here to
  // avoid starting a connection to localhost before runtime config is
  // resolved — that was causing two connections (first to localhost, then to
  // the real backend). We'll load `/config.json` at mount and then set a
  // resolved pollUrl; if no config is available we fall back to the local
  // mock stream.
  const [pollUrl, setPollUrl] = useState('')
  // backendPort learned from runtime config.json so we can switch between
  // mock and live endpoints when the user toggles `useLive`.
  const [backendPort, setBackendPort] = useState(null)
  const [pollIntervalSec, setPollIntervalSec] = useState(30)
  const [employees, setEmployees] = useState([])
  const [image, setImage] = useState(null)
  // When true, we auto-generate an SVG plan from factory dimensions and keep it in sync on change.
  // This is turned off if the user uploads a custom image.
  const [autoPlan, setAutoPlan] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const imgRef = useRef()
  const planRef = useRef()
  const pollRef = useRef()
  const streamControllerRef = useRef(null)
  const [view, setView] = useState('home')
  const [paths, setPaths] = useState({})
  const [connStatus, setConnStatus] = useState('closed') // connecting | open | closed
  const [logs, setLogs] = useState([])
  const [deviceNames, setDeviceNames] = useState(()=>{ try{ const s=localStorage.getItem('deviceNames'); return s?JSON.parse(s):{} }catch(e){return{}} })
  const [anchorNames, setAnchorNames] = useState(()=>{ try{ const s=localStorage.getItem('anchorNames'); return s?JSON.parse(s):{} }catch(e){return{}} })
  // Debug overlay state
  const [showDebug, setShowDebug] = useState(false)
  const [debugInfo, setDebugInfo] = useState(null)
  const [frameCount, setFrameCount] = useState(0)
  const [invertY, setInvertY] = useState(()=>{ try{ const s=localStorage.getItem('invertY'); return s?JSON.parse(s):false }catch(e){ return false } })
  const [calibration, setCalibration] = useState(()=>{ try{ const s=localStorage.getItem('calibration'); return s?JSON.parse(s):null }catch(e){ return null } })
  const [calMode, setCalMode] = useState(false)
  const [calPoints, setCalPoints] = useState([]) // [{nx,ny, wx,wy}]
  const [panelOpen, setPanelOpen] = useState(false)
  const [showMiniMap, setShowMiniMap] = useState(false)
  const [lastPacketAt, setLastPacketAt] = useState(null)
  const [fps, setFps] = useState(null)
  const frameTimesRef = useRef([])

  // Anchor interaction: add or drag
  const [anchorMode, setAnchorMode] = useState(false)
  // Hook for SVG pan/zoom and coordinate mapping (depends on calMode evaluation order)
  const { svgViewBox, setSvgViewBox, zoom, reset, clientToNormalized, normToPercent } = useSvgPanZoom({ planRef, imgRef, image, disabled: (anchorMode || calMode) })

  // Quick preset for mock: anchors at three corners matching backend mock IDs
  function resetCornerAnchors(){
    setAnchors([
      { beaconId: '020000b3', x: 0.0, y: 0.0 }, // top-left
      { beaconId: '02000053', x: 1.0, y: 0.0 }, // top-right
      { beaconId: '020000e6', x: 0.0, y: 1.0 }  // bottom-left
    ])
    kalmanRef.current = {}
    setSmoothed({})
    setEmployees([])
    pushLog('Anchors reset to mock corner preset (TL, TR, BL)')
  }

  // Anchors stored as normalized coordinates (0..1) and beaconId; meters computed from factory dims
  const [anchors, setAnchors] = useState(()=>{
    try{ const s = localStorage.getItem('anchors'); return s ? JSON.parse(s) : [
      // Default anchors at corners: top-left, top-right, bottom-left (no bottom-right)
      { beaconId: '020000b3', x: 0.0, y: 0.0 },
      { beaconId: '02000053', x: 1.0, y: 0.0 },
      { beaconId: '020000e6', x: 0.0, y: 1.0 }
    ]}catch(e){ return [] }
  })

  const [factoryWidthMeters, setFactoryWidthMeters] = useState(()=>{
    const s = localStorage.getItem('factoryWidthMeters'); return s?Number(s):20
  })
  const [factoryHeightMeters, setFactoryHeightMeters] = useState(()=>{
    const s = localStorage.getItem('factoryHeightMeters'); return s?Number(s):10
  })

  // smoothing (EMA) state per device
  const [smoothed, setSmoothed] = useState({})
  const smoothingAlpha = 0.45
  const [smoothingMethod, setSmoothingMethod] = useState(()=>{ try{ const s=localStorage.getItem('smoothingMethod'); return s||'ema' }catch(e){return 'ema'} })
  const kalmanRef = useRef({})

  // Generate a simple SVG plan based on factory dimensions (meters).
  // Returns an object { type: 'svg', content, width, height } where content is an SVG string.
  function generatePlanSvg(widthM, heightM){
    const W = Math.max(200, Math.round(widthM * 100))
    const H = Math.max(200, Math.round(heightM * 100))
    const gridSize = 50
    const stroke = '#8b6b3b'
    const bg = '#fffaf2'
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>\n  <rect width='100%' height='100%' fill='${bg}'/>\n  <g stroke='${stroke}' stroke-opacity='0.08' stroke-width='1'>\n    ${Array.from({length: Math.ceil(W/gridSize)}).map((_,i)=>`<line x1='${i*gridSize}' y1='0' x2='${i*gridSize}' y2='${H}'/>`).join('')}\n    ${Array.from({length: Math.ceil(H/gridSize)}).map((_,i)=>`<line x1='0' y1='${i*gridSize}' x2='${W}' y2='${i*gridSize}'/>`).join('')}\n  </g>\n  <rect x='1' y='1' width='${W-2}' height='${H-2}' fill='none' stroke='${stroke}' stroke-width='2' stroke-opacity='0.2'/>\n  <text x='12' y='20' font-family='sans-serif' font-size='14' fill='${stroke}' fill-opacity='0.6'>${widthM}m × ${heightM}m</text>\n</svg>`
    return { type: 'svg', content: svg, width: W, height: H }
  }

  // Create/sync default SVG plan on startup and when dims change (only if autoPlan is enabled)
  useEffect(()=>{
    if(!autoPlan) return
    const imgObj = generatePlanSvg(factoryWidthMeters, factoryHeightMeters)
    setImageLoaded(false)
    setImage(imgObj)
    // Initialize SVG viewbox to full image
    setTimeout(()=>{ setSvgViewBox({ x:0, y:0, w: imgObj.width, h: imgObj.height }) }, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryWidthMeters, factoryHeightMeters, autoPlan])

  // pan/zoom listeners and viewBox application are handled by useSvgPanZoom

  // Render anchors/devices/paths inside the inline SVG element (when plan is an inline svg).
  // We draw directly into the SVG DOM so overlays inherit viewBox transforms.
  useEffect(()=>{
    if(!image || image.type !== 'svg') return
    const wrapper = imgRef.current
    if(!wrapper) return
    const svgEl = wrapper.tagName && wrapper.tagName.toLowerCase() === 'svg' ? wrapper : wrapper.querySelector('svg')
    if(!svgEl) return

    // ensure original viewBox is set if svgViewBox is provided
    if(svgViewBox){ svgEl.setAttribute('viewBox', `${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`) }

    // remove previous overlay group
    const existing = svgEl.querySelector('#react-overlay-group')
    if(existing) existing.remove()

    const NS = 'http://www.w3.org/2000/svg'
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('id','react-overlay-group')
    // paths layer (under anchors) with fading segments
    const drawW = (image.width || (svgEl.viewBox?.baseVal?.width) || svgEl.clientWidth)
    const drawH = (image.height || (svgEl.viewBox?.baseVal?.height) || svgEl.clientHeight)
    // Compute user-units per CSS pixel to keep markers a consistent on-screen size
    const elRect = svgEl.getBoundingClientRect()
    const elW = Math.max(1, elRect.width || svgEl.clientWidth || drawW)
    const elH = Math.max(1, elRect.height || svgEl.clientHeight || drawH)
    const vbW = (svgViewBox?.w) || (svgEl.viewBox?.baseVal?.width) || drawW
    const vbH = (svgViewBox?.h) || (svgEl.viewBox?.baseVal?.height) || drawH
    // Assume uniform scaling (meet); use X scale for conversion
    const unitsPerPx = vbW / elW
    const pxToUnits = (px)=> (px * unitsPerPx)
    for(const deviceId of Object.keys(paths)){
      const arr = paths[deviceId] || []
      if(arr.length < 2) continue
      const maxSeg = Math.min(arr.length-1, 120) // last N segments
      const start = arr.length - 1 - maxSeg
      for(let i=start;i<arr.length-1;i++){
        const a = arr[i], b = arr[i+1]
        const x1 = (a.x) * drawW, y1 = (a.y) * drawH
        const x2 = (b.x) * drawW, y2 = (b.y) * drawH
        const seg = document.createElementNS(NS, 'line')
        seg.setAttribute('x1', x1.toFixed(1)); seg.setAttribute('y1', y1.toFixed(1))
        seg.setAttribute('x2', x2.toFixed(1)); seg.setAttribute('y2', y2.toFixed(1))
        seg.setAttribute('stroke', '#ef4444')
        seg.setAttribute('stroke-width', String(pxToUnits(3)))
        seg.setAttribute('vector-effect', 'non-scaling-stroke')
        const t = (i - start) / maxSeg
        const op = 0.15 + 0.75 * t // fade older segments
        seg.setAttribute('stroke-opacity', op.toFixed(2))
        seg.setAttribute('stroke-linecap', 'round')
        g.appendChild(seg)
      }
    }

    // anchors (constant on-screen size)
    anchors.forEach((a, idx) => {
      const ax = (a.x) * (image.width || svgEl.viewBox.baseVal.width || svgEl.clientWidth)
      const ay = (a.y) * (image.height || svgEl.viewBox.baseVal.height || svgEl.clientHeight)
      const ag = document.createElementNS(NS, 'g')
      ag.setAttribute('transform', `translate(${ax},${ay})`)
      ag.setAttribute('cursor','pointer')
      // allow pointer events on anchors
      ag.style.pointerEvents = 'auto'

      const circle = document.createElementNS(NS, 'circle')
      circle.setAttribute('r', String(pxToUnits(12)))
      circle.setAttribute('fill','#1d4ed8')
      circle.setAttribute('stroke','#ffffff')
      circle.setAttribute('stroke-width', String(pxToUnits(2)))
      circle.setAttribute('vector-effect', 'non-scaling-stroke')
      ag.appendChild(circle)

      const txt = document.createElementNS(NS, 'text')
      txt.setAttribute('x','0')
      txt.setAttribute('y', String(-pxToUnits(16)))
      txt.setAttribute('text-anchor','middle')
      txt.setAttribute('fill','#0b2540')
      txt.setAttribute('font-size', String(pxToUnits(10)))
      txt.textContent = anchorNames[a.beaconId] || a.beaconId
      ag.appendChild(txt)

      // events: mousedown -> start drag; click -> edit; contextmenu -> remove
      ag.addEventListener('mousedown', (e)=>{ e.preventDefault(); startAnchorDrag(idx, e) })
      ag.addEventListener('click', (e)=>{ e.stopPropagation(); const id = prompt('Edit beaconId', a.beaconId); if(!id) return; setAnchors(prev=> prev.map((p,i)=> i===idx? {...p, beaconId: id } : p)) })
      ag.addEventListener('contextmenu', (e)=>{ e.preventDefault(); setAnchors(prev=> prev.filter((_,i)=> i!==idx)) })

      g.appendChild(ag)
    })

    // devices (render as red circles with label below, constant on-screen size)
    employees.forEach(emp => {
      const ex = (emp.x) * (image.width || svgEl.viewBox.baseVal.width || svgEl.clientWidth)
      const ey = (emp.y) * (image.height || svgEl.viewBox.baseVal.height || svgEl.clientHeight)
      const dg = document.createElementNS(NS, 'g')
      dg.setAttribute('transform', `translate(${ex},${ey})`)
      dg.style.pointerEvents = 'auto'

      const circle = document.createElementNS(NS, 'circle')
      circle.setAttribute('r', String(pxToUnits(12)))
      circle.setAttribute('fill','#ef4444')
      circle.setAttribute('stroke','#ffffff')
      circle.setAttribute('stroke-width', String(pxToUnits(2)))
      circle.setAttribute('vector-effect', 'non-scaling-stroke')
      dg.appendChild(circle)

      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x','0')
      t.setAttribute('y', String(pxToUnits(20)))
      t.setAttribute('text-anchor','middle')
      t.setAttribute('fill','#0b2540')
      t.setAttribute('font-size', String(pxToUnits(10)))
      t.textContent = deviceNames[emp.id]||emp.label||emp.id
      dg.appendChild(t)

      g.appendChild(dg)
    })

    svgEl.appendChild(g)

    return ()=>{ const ex = svgEl.querySelector('#react-overlay-group'); if(ex) ex.remove() }
  }, [image, anchors, employees, paths, svgViewBox, anchorNames, deviceNames])

  // clientToNormalized and normToPercent provided by useSvgPanZoom

  // Append a normalized point (0..1) to device path history
  function pushDevicePoint(deviceId, nx, ny){
    if(!deviceId || isNaN(nx) || isNaN(ny)) return
    setPaths(prev => {
      const arr = prev[deviceId] ? prev[deviceId].concat([{ x: nx, y: ny, t: Date.now() }]) : [{ x: nx, y: ny, t: Date.now() }]
      const sliced = arr.length > MAX_PATH_POINTS ? arr.slice(arr.length - MAX_PATH_POINTS) : arr
      return { ...prev, [deviceId]: sliced }
    })
  }

  useEffect(()=>{
    // save anchors and factory sizes
    localStorage.setItem('anchors', JSON.stringify(anchors))
    localStorage.setItem('factoryWidthMeters', String(factoryWidthMeters))
    localStorage.setItem('factoryHeightMeters', String(factoryHeightMeters))
    localStorage.setItem('anchorNames', JSON.stringify(anchorNames))
    localStorage.setItem('deviceNames', JSON.stringify(deviceNames))
    localStorage.setItem('smoothingMethod', smoothingMethod)
    localStorage.setItem('invertY', JSON.stringify(invertY))
    if(calibration) localStorage.setItem('calibration', JSON.stringify(calibration)); else localStorage.removeItem('calibration')
  }, [anchors, factoryWidthMeters, factoryHeightMeters, anchorNames, deviceNames, invertY])
  // Apply world->normalized via calibration when available
  function worldToNorm(xm, ym){
    if(calibration && calibration.w2n){
      const [a,b,c,d,e,f] = calibration.w2n
      const nx = a*xm + b*ym + c
      const ny = d*xm + e*ym + f
      return { x: nx, y: ny }
    }
    return { x: xm / factoryWidthMeters, y: ym / factoryHeightMeters }
  }

  // Apply normalized->world via calibration when available
  function normToWorld(nx, ny){
    if(calibration && calibration.n2w){
      const [a,b,c,d,e,f] = calibration.n2w
      const xm = a*nx + b*ny + c
      const ym = d*nx + e*ny + f
      return { x: xm, y: ym }
    }
    return { x: nx * factoryWidthMeters, y: ny * factoryHeightMeters }
  }


  // Load runtime config once at mount. Only after resolving config do we set
  // pollUrl; this prevents the app from starting a connection to the wrong
  // (localhost) URL and then immediately reconnecting.
  useEffect(()=>{
    let cancelled = false
    ;(async function(){
      try{
        const r = await fetch('/config.json', { cache: 'no-store' })
        if(!cancelled){
          if(r.ok){
            const cfg = await r.json()
            if(cfg && cfg.backendPort){
              setBackendPort(cfg.backendPort)
              pushLog(`Loaded config.json backendPort=${cfg.backendPort}`)
              return
            }
          }
        }
      }catch(e){ /* ignore */ }
      // fallback if no config or fetch failed
      if(!cancelled){
        setBackendPort(8080)
        pushLog('Using fallback backendPort=8080')
      }
    })()
    return ()=>{ cancelled = true }
  }, [])

  // When backendPort or useLive changes, derive the pollUrl automatically.
  useEffect(()=>{
    if(!backendPort) return
    const host = window.location.hostname
    const url = useLive
      ? `http://${host}:${backendPort}/proxy/uwbStream`
      : `http://${host}:${backendPort}/mock/stream?w=${encodeURIComponent(factoryWidthMeters)}&h=${encodeURIComponent(factoryHeightMeters)}&az=1.5&tz=1.5&tzAmp=0.2&tzHz=0.1&noise=0.05&outlierRate=0.05&outlierScale=1.8&dropRate=0.05&zeroRate=0.02`
    setPollUrl(url)
    pushLog(`pollUrl set to ${url} (useLive=${useLive})`)
  }, [backendPort, useLive, factoryWidthMeters, factoryHeightMeters])

  // clear per-device Kalman filters when anchors change (recalibration)
  useEffect(()=>{
    kalmanRef.current = {}
    pushLog('Kalman filters reset due to anchor change')
  }, [anchors])

  // remove polling; both mock and live use streaming endpoints now

  // Unified streaming effect: connect to whichever `pollUrl` is active
  useEffect(()=>{
    let stopped = false
    async function startStream(){
      stopLiveStream()
      if(!pollUrl || view !== 'home') return
      try{
        setConnStatus('connecting')
        const headers = {}
        const ac = new AbortController()
        streamControllerRef.current = ac
        const res = await fetch(pollUrl, { headers, signal: ac.signal })
        if(!res.ok){ console.warn('Stream responded', res.status); return }
        setConnStatus('open')
        pushLog(`Connected to ${pollUrl}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buf = ''
        while(true){
          const { done, value } = await reader.read()
          if(done) break
          buf += decoder.decode(value, { stream: true })
          // parse SSE-like chunks separated by double-newline
          let idx
          while((idx = buf.indexOf('\n\n')) !== -1){
            const raw = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const lines = raw.split(/\r?\n/)
            let dataLines = []
            for(const line of lines){
              if(line.startsWith('data:')) dataLines.push(line.replace(/^data:\s*/,''))
            }
            if(dataLines.length===0) continue
            const dataText = dataLines.join('\n')
            try{
              const parsed = JSON.parse(dataText)
              if(parsed && parsed.type === 'uwb_update' && parsed.payload) { handleUwbUpdate(parsed.payload); pushLog(`recv uwb_update ${parsed.payload.deviceIdHex||parsed.payload.deviceId||''}`) }
              else if(parsed && parsed.payload && parsed.payload.beacons) { handleUwbUpdate(parsed.payload); pushLog(`recv payload ${parsed.payload.deviceIdHex||parsed.payload.deviceId||''}`) }
              else if(parsed && parsed.beacons) { handleUwbUpdate(parsed); pushLog(`recv beacons ${parsed.deviceIdHex||parsed.deviceId||''}`) }
            }catch(err){ /* ignore non-JSON frames */ }
          }
          if(stopped) break
        }
        pushLog(`Stream closed from ${pollUrl}`)
        setConnStatus('closed')
      }catch(err){ if(err.name === 'AbortError') return; console.error('Stream error', err) }
    }

    function stopLiveStream(){
      const ac = streamControllerRef.current
      if(ac){ try{ ac.abort() }catch(e){}; streamControllerRef.current = null }
    }

    if(pollUrl) startStream()
    return ()=>{ stopped = true; stopLiveStream() }
  }, [pollUrl, view])

  function pushLog(line){
    setLogs(prev => ([...(prev||[]).slice(-49), `${new Date().toLocaleTimeString()}: ${line}`]))
  }

  /**
   * Fetch from the configured pollUrl and dispatch to the appropriate handler.
   * Supports both the mocked `uwb_update` payload and an older `positions` array format.
   */
  async function fetchPositions(){
    try{
      // For mock polling we don't need special headers.
      const headers = {}
      if(!useLive && apiKey) headers['x-api-key'] = apiKey
      const res = await axios.get(pollUrl, { headers })
      const data = res.data
      // handle possible streaming- or array-wrapped responses
      if(data && data.type === 'uwb_update' && data.payload && data.payload.beacons){
        handleUwbUpdate(data.payload)
      } else if(Array.isArray(data)){
        // maybe an array of updates; process first for demo
        for(const d of data){ if(d && d.type==='uwb_update' && d.payload) handleUwbUpdate(d.payload) }
      } else if(data && data.payload && data.payload.beacons){
        handleUwbUpdate(data.payload)
      } else if(res.data.positions){
        setEmployees(res.data.positions || [])
      }
    }catch(e){
      console.error(e)
      // don't flood alerts during polling; show once
    }
  }

  /**
   * If anchorMode is active, adds an anchor at the clicked normalized position
   * and prompts the user for the anchor's `beaconId`.
   */
  function onPlanClick(e){
    if(calMode){
      if(!planRef.current) return
      const { nx, ny } = clientToNormalized(e.clientX, e.clientY)
      // append with blank world coords to fill later
      setCalPoints(prev => prev.length>=3 ? prev : prev.concat([{ nx, ny, wx: '', wy: '' }]))
      return
    }
    if(!anchorMode) return
    if(!planRef.current) return
    const { nx, ny } = clientToNormalized(e.clientX, e.clientY)
    const beaconId = window.prompt('Enter beaconId for this anchor (e.g. 020000b3):')
    if(!beaconId) return
    setAnchors(a=>[...a, { beaconId, x: nx, y: ny }])
  }

  /**
   * Begin dragging an existing anchor. Attaches mousemove/mouseup handlers to
   * update the anchor position in normalized coordinates while dragging.
   */
  function startAnchorDrag(i, e){
    e.preventDefault();
    if(calMode) return; // disable dragging during calibration
    // use the plan container rect for robust coordinates (image may resize/load)
    const onMove = (ev)=>{
      if(!planRef.current) return
      const { nx, ny } = clientToNormalized(ev.clientX, ev.clientY)
      setAnchors(prev => prev.map((it, idx)=> idx===i ? { ...it, x: nx, y: ny } : it))
    }
    const onUp = ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
    document.body.style.cursor = 'grabbing'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Solve 3-point affine from world->normalized and normalized->world
  function solveCalibration(){
    if(calPoints.length !== 3){ pushLog('Calibration needs 3 points'); return }
    // parse world coords
    const pts = calPoints.map(p => ({ nx: p.nx, ny: p.ny, wx: Number(p.wx), wy: Number(p.wy) }))
    if(pts.some(p => !Number.isFinite(p.wx) || !Number.isFinite(p.wy))){ pushLog('Invalid world coordinates'); return }
    // Build matrices to solve for w2n: [nx ny]^T = A * [wx wy 1]^T (2x3)
    function solveAffine(pairs, forward=true){
      // Solve for coeffs using direct 3-point solution
      const [[x1,y1,u1,v1],[x2,y2,u2,v2],[x3,y3,u3,v3]] = pairs.map(p => forward ? [p.wx,p.wy,p.nx,p.ny] : [p.nx,p.ny,p.wx,p.wy])
      // We solve for a,b,c,d,e,f s.t. u = a*x + b*y + c; v = d*x + e*y + f
      function det(a,b,c,d,e,f){ return a*(e*1 - f*0) - b*(d*1 - f*0) + c*(d*0 - e*0) } // placeholder
      // Use Cramer's rule on 3 equations for (a,b,c) and (d,e,f)
      const M = [
        [x1, y1, 1],
        [x2, y2, 1],
        [x3, y3, 1],
      ]
      function det3(m){
        return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
      }
      const D = det3(M)
      if(Math.abs(D) < 1e-9) return null
      const Mu = [ [u1,y1,1],[u2,y2,1],[u3,y3,1] ]
      const Mv = [ [v1,y1,1],[v2,y2,1],[v3,y3,1] ]
      const Mb = [ [x1,u1,1],[x2,u2,1],[x3,u3,1] ]
      const Mc = [ [x1,y1,u1],[x2,y2,u2],[x3,y3,u3] ]
      const Md = [ [v1,y1,1],[v2,y2,1],[v3,y3,1] ]
      const Me = [ [x1,v1,1],[x2,v2,1],[x3,v3,1] ]
      const Mf = [ [x1,y1,v1],[x2,y2,v2],[x3,y3,v3] ]
      const a = det3(Mu)/D, b = det3(Mb)/D, c = det3(Mc)/D
      const d = det3(Md)/D, e = det3(Me)/D, f = det3(Mf)/D
      return [a,b,c,d,e,f]
    }

    const w2n = solveAffine(pts, true)
    const n2w = solveAffine(pts, false)
    if(!w2n || !n2w){ pushLog('Calibration failed: degenerate points'); return }
    setCalibration({ w2n, n2w })
    setCalMode(false)
    pushLog('Calibration saved and applied')
  }

  /**
   * Given a UWB payload (payload.beacons array), run trilateration and update
   * the smoothed position for the device. The result is converted to normalized
   * coordinates relative to the configured factory dimensions.
   * @param {{deviceIdHex: string, beacons: Array}} payload
   */
  function handleUwbUpdate(payload){
    // payload.beacons -> [{beaconId, distance}]
    // The live streaming API reports distances in centimeters.
    // Convert to meters when `useLive` is set. Local/mock endpoints are
    // expected to already return meters, so we leave them as-is.
  const anchorsInMeters = (anchors||[]).map(a => { const w = normToWorld(a.x, a.y); return ({ beaconId: a.beaconId, x: w.x, y: w.y }) })
  const rawDistances = (payload && Array.isArray(payload.beacons) ? payload.beacons : []).map(b => ({ beaconId: b.beaconId, distance: b.distance }))
  // Both mock and live streams provide distances in centimeters; convert to meters
  const distances = rawDistances.map(d => ({ ...d, distance: d.distance / 100 }))
  // Restrict to distances that correspond to known anchors and are finite
  const usable = distances.filter(d => anchorsInMeters.some(a => a.beaconId === d.beaconId) && Number.isFinite(d.distance) && d.distance >= 0)
  // Ignore updates when fewer than 3 beacons are present to avoid skewed results
  if(usable.length < 3){
    pushLog(`ignoring update: only ${usable.length} beacon(s) usable`)
    return
  }
  // If any measurement is exactly zero, prefer treating that as an anchor hit
  const hasZero = usable.some(d => d.distance === 0)
  const pos = trilaterate(anchorsInMeters, usable, { zeroIsAnchor: hasZero })
    if(!pos){
      pushLog(`triangulation failed: anchors=${anchorsInMeters.length} beacons=${distances.length}`)
      setDebugInfo({ when: Date.now(), reason: 'triangulation-failed', anchorsInMeters, distancesCm: rawDistances, distancesM: usable, payload })
      return
    }
  let norm = worldToNorm(pos.x, pos.y)
  if(invertY) norm = { x: norm.x, y: 1 - norm.y }
    if(!Number.isFinite(norm.x) || !Number.isFinite(norm.y)){
      pushLog(`triangulation produced NaN: pos=(${pos.x?.toFixed?.(3)||pos.x},${pos.y?.toFixed?.(3)||pos.y})`)
      setDebugInfo({ when: Date.now(), reason: 'nan', posMeters: pos, anchorsInMeters, distancesCm: rawDistances, distancesM: distances, payload })
      return
    }
    // record raw result for debug overlay (pre-smoothing)
  // clamp to visible bounds to avoid off-canvas rendering when dimensions are tiny
  const clamped = { x: Math.min(1, Math.max(0, norm.x)), y: Math.min(1, Math.max(0, norm.y)) }
  const nowTs = Date.now()
  setDebugInfo({ when: nowTs, posMeters: pos, norm, clamped, anchorsInMeters, distancesCm: rawDistances, distancesM: distances, payload, smoothingMethod, invertY })
  setFrameCount(c=>c+1)
  setLastPacketAt(nowTs)
  // update FPS as frames per second over last 10s window
  const buf = frameTimesRef.current
  buf.push(nowTs)
  const cutoff = nowTs - 10000
  while(buf.length && buf[0] < cutoff) buf.shift()
  setFps(buf.length / 10)

    // smoothing and path history
    const id = payload.deviceIdHex || payload.deviceId || 'mock-device'
  if(smoothingMethod === 'kalman'){
      // use per-device Kalman filters
      if(!kalmanRef.current[id]) kalmanRef.current[id] = new Kalman2D(0.0005, 0.002)
      const kf = kalmanRef.current[id]
  const filtered = kf.update(clamped)
  setSmoothed(prev => ({ ...prev, [id]: filtered }))
  setEmployees([{ id, label: deviceNames[id]||id, x: filtered.x, y: filtered.y, t: Date.now() }])
  pushLog(`pos[kalman]: ${filtered.x.toFixed(3)}, ${filtered.y.toFixed(3)}`)
      pushDevicePoint(id, filtered.x, filtered.y)
    } else {
      // default EMA
      setSmoothed(prev => {
        const prevPos = prev[id]
        const newPos = prevPos ? {
          x: smoothingAlpha*clamped.x + (1-smoothingAlpha)*prevPos.x,
          y: smoothingAlpha*clamped.y + (1-smoothingAlpha)*prevPos.y
        } : clamped
    const next = { ...prev, [id]: newPos }
  // update rendered employees list (use display name if available)
  setEmployees([{ id, label: deviceNames[id]||id, x: newPos.x, y: newPos.y, t: Date.now() }])
    pushLog(`pos[ema]: ${newPos.x.toFixed(3)}, ${newPos.y.toFixed(3)}`)
        // append to path history via helper
        pushDevicePoint(id, newPos.x, newPos.y)
        return next
      })
    }
  }

  function clearLines(){
    setPaths(prev => {
      const out = {}
      for(const k of Object.keys(prev)){
        const arr = prev[k]
        if(arr && arr.length) out[k] = [arr[arr.length-1]]
      }
      return out
    })
  }

  function clearAllLines(){
    setPaths({})
  }

  return (
    <div className={`app ${panelOpen? 'panel-open':''}`}>
  <TopBar onOpenAdmin={()=>setView('admin')} onNavigate={(v)=>setView(v)} currentView={view} backendPort={backendPort} pollUrl={pollUrl} useLive={useLive} setUseLive={setUseLive} connStatus={connStatus} onTogglePanel={()=> setPanelOpen(v=>!v)} fps={fps} lastPacketAt={lastPacketAt} panelOpen={panelOpen}>

        <Mantine.Container fluid style={{ padding: 18 }}>
          <Mantine.Grid gutter="xl">
        {view === 'admin' && (
          <Mantine.Grid.Col span={12}>
            <Mantine.Card radius="md" p="md">
              <Admin
                anchors={anchors}
                setAnchors={setAnchors}
                anchorNames={anchorNames}
                setAnchorNames={setAnchorNames}
                deviceNames={deviceNames}
                setDeviceNames={setDeviceNames}
                factoryWidthMeters={factoryWidthMeters}
                factoryHeightMeters={factoryHeightMeters}
                setFactoryWidthMeters={setFactoryWidthMeters}
                setFactoryHeightMeters={setFactoryHeightMeters}
                apiKey={apiKey}
                setApiKey={setApiKey}
                pollUrl={pollUrl}
                setPollUrl={setPollUrl}
                useLive={useLive}
                setUseLive={setUseLive}
                smoothingMethod={smoothingMethod}
                setSmoothingMethod={setSmoothingMethod}
                connStatus={connStatus}
                logs={logs}
                fetchNow={fetchPositions}
                clearLines={clearLines}
                clearAllLines={clearAllLines}
                onClose={()=>setView('home')}
              />
            </Mantine.Card>
          </Mantine.Grid.Col>
        )}

  <Mantine.Grid.Col span={12}>
          <Mantine.Card radius="md" p="md" shadow="sm">
            <Mantine.Group position="apart" mb="sm">
              <Mantine.Group spacing="xs">
                <IconMapPin size={18} />
                <Mantine.Text weight={600}>Factory Plan</Mantine.Text>
              </Mantine.Group>
              <Mantine.Group style={{ marginLeft:'auto' }}>
                <Mantine.FileInput size="sm" variant="filled" className="control-pill" placeholder="Upload plan image" accept="image/*" onChange={(f)=>{ if(!f) return; setAutoPlan(false); setImageLoaded(false); setImage(URL.createObjectURL(f)); }} />
                {/* Canvas modifiers moved into on-canvas overlay; placement is controlled from Right Panel */}
              </Mantine.Group>
            </Mantine.Group>

            <div className="planCanvas" onClick={onPlanClick} ref={planRef}>
              {image ? (
                typeof image === 'string' ? (
                  <img ref={imgRef} src={image} alt="plan" onLoad={()=>setImageLoaded(true)} />
                ) : image.type === 'svg' ? (
                  <div ref={imgRef} dangerouslySetInnerHTML={{ __html: image.content }} />
                ) : (
                  <img ref={imgRef} src={image} alt="plan" onLoad={()=>setImageLoaded(true)} />
                )
              ) : <div className="empty">No plan loaded</div>}
              {/* Canvas controls overlay (top-right) */}
              <CanvasControls
                image={image}
                svgViewBox={svgViewBox}
                  onZoomIn={()=> image && image.type==='svg' && zoom(1.25)}
                  onZoomOut={()=> image && image.type==='svg' && zoom(0.8)}
                  onReset={()=> image && image.type==='svg' && reset()}
                zoomPercentText={image && image.type==='svg' && svgViewBox ? `${Math.round((image.width/svgViewBox.w)*100)}%` : '100%'}
              />

              {/* Calibration HUD */}
              {calMode && (
                <CalibrationHUD
                  calPoints={calPoints}
                  setCalPoints={setCalPoints}
                  calibration={calibration}
                  setCalibration={setCalibration}
                  solveCalibration={solveCalibration}
                  pushLog={pushLog}
                />
              )}

              {/* For raster images, draw overlay path layer and HTML badges; for inline SVG, we draw inside the SVG via DOM effect */}
              {!(image && image.type === 'svg') && (
                <>
                  {/* SVG path layer */}
                  <svg className="pathLayer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                    {Object.keys(paths).map(deviceId => {
                      const arr = paths[deviceId] || []
                      const pts = arr.map(p=>{
                        const pos = normToPercent(p.x, p.y)
                        const vx = (pos.left/100.0) * 1000.0
                        const vy = (pos.top/100.0) * 1000.0
                        return `${vx.toFixed(1)},${vy.toFixed(1)}`
                      }).join(' ')
                      const lastIdx = arr.length - 1
                      const hasSegment = arr.length >= 2
                      let seg = null
                      if(hasSegment){
                        const a = arr[lastIdx-1]
                        const b = arr[lastIdx]
                        const pa = normToPercent(a.x, a.y)
                        const pb = normToPercent(b.x, b.y)
                        const x1 = ((pa.left/100.0) * 1000.0).toFixed(1), y1 = ((pa.top/100.0) * 1000.0).toFixed(1)
                        const x2 = ((pb.left/100.0) * 1000.0).toFixed(1), y2 = ((pb.top/100.0) * 1000.0).toFixed(1)
                        seg = <line key={deviceId+"-seg-"+b.x+"-"+b.y} className="drawSegment" x1={x1} y1={y1} x2={x2} y2={y2} fill="none" stroke="#ef4444" strokeWidth="3" strokeOpacity="0.9" strokeLinecap="round" />
                      }
                      if(!pts) return null
                      return (
                        <g key={deviceId}>
                          <polyline points={pts} fill="none" stroke="#ef4444" strokeWidth="3" strokeOpacity="0.85" />
                          {seg}
                        </g>
                      )
                    })}
                  </svg>

                  {/* anchors overlay */}
                  <PlanAnchorsOverlay
                    anchors={anchors}
                    anchorNames={anchorNames}
                    normToPercent={normToPercent}
                    onStartDrag={(idx, e)=> startAnchorDrag(idx, e)}
                    onEdit={(idx)=>{ const a = anchors[idx]; if(!a) return; const id = prompt('Edit beaconId', a.beaconId); if(!id) return; setAnchors(prev=> prev.map((p,i)=> i===idx? {...p, beaconId: id } : p)) }}
                    onRemove={(idx)=> setAnchors(prev=> prev.filter((_,i)=> i!==idx))}
                  />

                  {/* employees overlay */}
                  <DevicesOverlay
                    employees={employees}
                    deviceNames={deviceNames}
                    normToPercent={normToPercent}
                    onCenter={(id)=>{ /* TODO: center on device by adjusting viewBox in future */ }}
                  />
                </>
              )}
            </div>
            {/* Mini-map overlay (toggle from Right Panel) */}
            {showMiniMap && (
              <MiniMap paths={paths} anchors={anchors} image={image} svgViewBox={svgViewBox} />
            )}
            {/* Scale bar and compass */}
            <div style={{ position:'absolute', left:16, bottom:16, zIndex:12, color:'#6b5e4a', fontSize:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:80, height:2, background:'#6b5e4a' }} />
                <span>≈ {(factoryWidthMeters/10).toFixed(1)} m</span>
              </div>
            </div>
            <div style={{ position:'absolute', left:16, top:16, zIndex:12, color:'#6b5e4a', fontSize:12 }}>
              X →, Y ↑
            </div>
  </Mantine.Card>
  </Mantine.Grid.Col>

  {/* Bottom row: Anchors (left) and Latest Positions (right) to free up vertical space for the plan */}
  <Mantine.Grid.Col span={8}>
    <AnchorsCard
      anchors={anchors}
      setAnchors={setAnchors}
      factoryWidthMeters={factoryWidthMeters}
      setFactoryWidthMeters={setFactoryWidthMeters}
      factoryHeightMeters={factoryHeightMeters}
      setFactoryHeightMeters={setFactoryHeightMeters}
      deviceNames={deviceNames}
      onClearAnchors={()=>{ setAnchors([]); setSmoothed({}); setEmployees([]); kalmanRef.current = {} }}
    />
  </Mantine.Grid.Col>

  <Mantine.Grid.Col span={4}></Mantine.Grid.Col>
      </Mantine.Grid>
      </Mantine.Container>
      </TopBar>
  <RightPanel open={panelOpen} onClose={()=> setPanelOpen(false)} anchors={anchors} employees={employees} logs={logs} debugInfo={debugInfo} frameCount={frameCount} showDebug={showDebug} setShowDebug={setShowDebug} invertY={invertY} setInvertY={setInvertY} calMode={calMode} setCalMode={(v)=>{ setCalMode(v); if(!v) setCalPoints([]) }} onMockAnchors={resetCornerAnchors} anchorMode={anchorMode} setAnchorMode={setAnchorMode} showMiniMap={showMiniMap} setShowMiniMap={setShowMiniMap} />
    </div>
  )
}

export default App
