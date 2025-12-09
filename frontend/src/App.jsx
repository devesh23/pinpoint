/*
 * =============================
 * Pinpoint Frontend Root (App)
 * =============================
 * High-Level Overview:
 * - Establishes streaming connection (SSE) to backend (`/proxy/uwbStream`) for live UWB updates.
 * - Maintains anchor definitions (normalized coordinates) and converts to world meters.
 * - Performs trilateration on incoming distance payloads -> normalized 2D positions.
 * - Smooths positions (EMA or per-device Kalman) and appends to path history for rendering.
 * - Renders factory plan either as generated inline SVG (autoPlan) or user-uploaded image.
 * - Provides calibration workflow (3-point affine) enabling mapping world <-> normalized coords.
 * - Exposes admin & debug panels (anchor editing, logs, smoothing mode, mini-map toggle).
 *
 * Data Flow (simplified):
 *   SSE frame (uwb_update) -> handleUwbUpdate -> distances filtered & converted -> trilaterate ->
 *   smoothing -> employees state -> overlay rendering (SVG DOM injection or raster overlay).
 *
 * Performance Considerations:
 * - Path rendering: recent segments only, fading older ones to limit DOM nodes.
 * - Pixel-consistent marker sizing achieved by translating CSS pixels -> viewBox units.
 * - Broadcast frequency tuned by backend (~600ms mock) — FPS measured over 10s sliding window.
 *
 * See `ARCHITECTURE.md` for full diagrammatic context.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react'
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
import Admin from './components/Admin'
import { Kalman2D } from './kalman'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { IconDeviceAnalytics, IconListDetails, IconBuilding, IconSettings, IconRefresh, IconChevronDown, IconNavigation, IconLayersLinked, IconFocusCentered, IconCompass, IconArrowsMaximize, IconZoomIn, IconZoomOut, IconMaximize, IconTarget } from '@tabler/icons-react'

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

function App() {
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
  const [adminOpen, setAdminOpen] = useState(false)
  const [paths, setPaths] = useState({})
  const [connStatus, setConnStatus] = useState('closed') // connecting | open | closed
  const [logs, setLogs] = useState([])
  const [deviceNames, setDeviceNames] = useState(() => { try { const s = localStorage.getItem('deviceNames'); return s ? JSON.parse(s) : {} } catch (e) { return {} } })
  const [anchorNames, setAnchorNames] = useState(() => { try { const s = localStorage.getItem('anchorNames'); return s ? JSON.parse(s) : {} } catch (e) { return {} } })
  // Debug overlay state
  const [showDebug, setShowDebug] = useState(false)
  const [debugInfo, setDebugInfo] = useState(null)
  const [frameCount, setFrameCount] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showMiniMap, setShowMiniMap] = useState(false)
  const [lastPacketAt, setLastPacketAt] = useState(null)
  const [fps, setFps] = useState(null)
  const frameTimesRef = useRef([])

  // Anchor interaction: add or drag
  const [anchorMode, setAnchorMode] = useState(false)
  // Hook for SVG pan/zoom and coordinate mapping (depends on calMode evaluation order)
  // Hook for SVG pan/zoom and coordinate mapping
  const { svgViewBox, setSvgViewBox, zoom, reset, clientToUnits, normToPercent } = useSvgPanZoom({ planRef, imgRef, image, disabled: anchorMode })

  // Wrapper to convert meter coordinates to percentage positions
  const metersToPercent = (xMeters, yMeters) => {
    const nx = xMeters / factoryWidthMeters
    const ny = yMeters / factoryHeightMeters
    return normToPercent(nx, ny)
  }


  // Quick preset for mock: anchors at three corners matching backend mock IDs
  function resetCornerAnchors() {
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

  const [factoryWidthMeters, setFactoryWidthMeters] = useState(() => {
    const s = localStorage.getItem('factoryWidthMeters'); return s ? Number(s) : 20
  })
  const [factoryHeightMeters, setFactoryHeightMeters] = useState(() => {
    const s = localStorage.getItem('factoryHeightMeters'); return s ? Number(s) : 10
  })

  // Anchors stored as meters (x, y) and beaconId
  const [anchors, setAnchors] = useState(() => {
    try {
      const s = localStorage.getItem('anchors');
      let arr = s ? JSON.parse(s) : [
        // Default anchors at corners: top-left, top-right, bottom-left (no bottom-right)
        { beaconId: '020000b3', x: 0.0, y: 0.0 },
        { beaconId: '02000053', x: 20.0, y: 0.0 },
        { beaconId: '020000e6', x: 0.0, y: 10.0 }
      ]
      // Migration: if anchors look normalized (all <= 1.0) and factory is large, scale them
      const w = Number(localStorage.getItem('factoryWidthMeters')) || 20
      const h = Number(localStorage.getItem('factoryHeightMeters')) || 10
      if (arr.length > 0 && arr.every(a => Math.abs(a.x) <= 1.0 && Math.abs(a.y) <= 1.0) && (w > 2 || h > 2)) {
        arr = arr.map(a => ({ ...a, x: a.x * w, y: a.y * h }))
      }
      return arr
    } catch (e) { return [] }
  })

  // Z-axis configuration
  const [anchorHeight, setAnchorHeight] = useState(() => { const s = localStorage.getItem('anchorHeight'); return s ? Number(s) : 2.5 })
  const [tagHeight, setTagHeight] = useState(() => { const s = localStorage.getItem('tagHeight'); return s ? Number(s) : 1.0 })

  // Packet filtering
  const [lastPacketTimestamp, setLastPacketTimestamp] = useState({}) // { [deviceId]: timestamp }

  // smoothing (EMA) state per device
  const [smoothed, setSmoothed] = useState({})
  const smoothingAlpha = 0.45
  const [smoothingMethod, setSmoothingMethod] = useState(() => { try { const s = localStorage.getItem('smoothingMethod'); return s || 'ema' } catch (e) { return 'ema' } })
  const kalmanRef = useRef({})

  // Generate a simple SVG plan based on factory dimensions (meters).
  // Returns an object { type: 'svg', content, width, height } where content is an SVG string.
  /**
   * Programmatically construct a simple SVG plan sized proportionally to factory meters.
   * Includes faint grid lines to assist anchor placement and a caption with dimensions.
   * Returned object shape: { type:'svg', content:string, width:number, height:number }
   */
  function generatePlanSvg(widthM, heightM) {
    // Use meters directly for viewBox
    const W = widthM
    const H = heightM
    const gridSize = 5 // 5 meter grid
    const stroke = '#8b6b3b'
    const bg = '#fffaf2'
    // Note: stroke-width needs to be small since we are in meter units
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>\n  <rect width='100%' height='100%' fill='${bg}'/>\n  <g stroke='${stroke}' stroke-opacity='0.08' stroke-width='0.05'>\n    ${Array.from({ length: Math.ceil(W / gridSize) }).map((_, i) => `<line x1='${i * gridSize}' y1='0' x2='${i * gridSize}' y2='${H}'/>`).join('')}\n    ${Array.from({ length: Math.ceil(H / gridSize) }).map((_, i) => `<line x1='0' y1='${i * gridSize}' x2='${W}' y2='${i * gridSize}'/>`).join('')}\n  </g>\n  <rect x='0.1' y='0.1' width='${W - 0.2}' height='${H - 0.2}' fill='none' stroke='${stroke}' stroke-width='0.1' stroke-opacity='0.2'/>\n  <text x='0.5' y='1' font-family='sans-serif' font-size='0.5' fill='${stroke}' fill-opacity='0.6'>${widthM}m × ${heightM}m</text>\n</svg>`
    return { type: 'svg', content: svg, width: W, height: H }
  }

  // Create/sync default SVG plan on startup and when dims change (only if autoPlan is enabled)
  // Auto-regenerate plan SVG whenever dimensions change and custom image not in use.
  useEffect(() => {
    if (!autoPlan) return
    const imgObj = generatePlanSvg(factoryWidthMeters, factoryHeightMeters)
    setImageLoaded(false)
    setImage(imgObj)
    // Initialize SVG viewbox to full image
    setTimeout(() => { setSvgViewBox({ x: 0, y: 0, w: imgObj.width, h: imgObj.height }) }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryWidthMeters, factoryHeightMeters, autoPlan])

  // pan/zoom listeners and viewBox application are handled by useSvgPanZoom

  // Render anchors/devices/paths inside the inline SVG element (when plan is an inline svg).
  // We draw directly into the SVG DOM so overlays inherit viewBox transforms.
  // Inline SVG overlay effect: inject transient <g id='react-overlay-group'> containing markers & paths.
  // This avoids rerendering the full SVG and preserves crisp scaling under zoom/pan.
  // Render anchors/devices/paths inside the inline SVG element (when plan is an inline svg).
  // We draw directly into the SVG DOM so overlays inherit viewBox transforms.
  // Inline SVG overlay effect: inject transient <g id='react-overlay-group'> containing markers & paths.
  // This avoids rerendering the full SVG and preserves crisp scaling under zoom/pan.
  useEffect(() => {
    if (!image || image.type !== 'svg') return
    const wrapper = imgRef.current
    if (!wrapper) return
    const svgEl = wrapper.tagName && wrapper.tagName.toLowerCase() === 'svg' ? wrapper : wrapper.querySelector('svg')
    if (!svgEl) return

    // ensure original viewBox is set if svgViewBox is provided
    if (svgViewBox) { svgEl.setAttribute('viewBox', `${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`) }

    // remove previous overlay group
    const existing = svgEl.querySelector('#react-overlay-group')
    if (existing) existing.remove()

    const NS = 'http://www.w3.org/2000/svg'
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('id', 'react-overlay-group')
    // paths layer (under anchors) with fading segments
    const drawW = (image.width || (svgEl.viewBox?.baseVal?.width) || svgEl.clientWidth)
    const drawH = (image.height || (svgEl.viewBox?.baseVal?.height) || svgEl.clientHeight)

    // Scaling factor from meters to SVG units
    const scaleX = drawW / factoryWidthMeters
    const scaleY = drawH / factoryHeightMeters

    // Compute user-units per CSS pixel to keep markers a consistent on-screen size
    const elRect = svgEl.getBoundingClientRect()
    const elW = Math.max(1, elRect.width || svgEl.clientWidth || drawW)
    const vbW = (svgViewBox?.w) || (svgEl.viewBox?.baseVal?.width) || drawW
    // unitsPerPx = viewBoxUnits / cssPixels
    const unitsPerPx = vbW / elW
    const pxToUnits = (px) => (px * unitsPerPx)

    // Marker sizing rules (bump up sizes for very small plans)
    const isTinyPlan = Number(factoryWidthMeters) <= 2 && Number(factoryHeightMeters) <= 2
    const markerRadiusPx = isTinyPlan ? 20 : 12
    const markerStrokePx = isTinyPlan ? 4 : 2
    const markerFontPx = Math.max(8, isTinyPlan ? 14 : 10) // never below 8px
    const anchorLabelOffsetAbovePx = markerRadiusPx + (isTinyPlan ? 12 : 6)
    const deviceLabelOffsetBelowPx = markerRadiusPx + (isTinyPlan ? 12 : 8)
    // Slightly increase path thickness for very small factory plans (e.g., 1.6m x 1.6m)
    const targetStrokePx = (() => {
      const w = Number(factoryWidthMeters)
      const h = Number(factoryHeightMeters)
      if (Number.isFinite(w) && Number.isFinite(h) && w <= 2 && h <= 2) return 5
      return 3
    })()
    for (const deviceId of Object.keys(paths)) {
      const arr = paths[deviceId] || []
      if (arr.length < 2) continue
      const maxSeg = Math.min(arr.length - 1, 120) // last N segments
      const start = arr.length - 1 - maxSeg
      for (let i = start; i < arr.length - 1; i++) {
        const a = arr[i], b = arr[i + 1]
        const x1 = a.x * scaleX, y1 = a.y * scaleY
        const x2 = b.x * scaleX, y2 = b.y * scaleY
        const seg = document.createElementNS(NS, 'line')
        seg.setAttribute('x1', x1.toFixed(3)); seg.setAttribute('y1', y1.toFixed(3))
        seg.setAttribute('x2', x2.toFixed(3)); seg.setAttribute('y2', y2.toFixed(3))
        seg.setAttribute('stroke', '#ef4444')
        seg.setAttribute('stroke-width', String(pxToUnits(targetStrokePx)))
        seg.setAttribute('vector-effect', 'non-scaling-stroke')
        const t = (i - start) / maxSeg
        const base = isTinyPlan ? 0.4 : 0.15
        const span = isTinyPlan ? 0.6 : 0.75
        const op = base + span * t // fade older segments, but keep more visible on tiny plans
        seg.setAttribute('stroke-opacity', op.toFixed(2))
        seg.setAttribute('stroke-linecap', 'round')
        g.appendChild(seg)
      }
    }

    // anchors (constant on-screen size)
    anchors.forEach((a, idx) => {
      const ax = a.x * scaleX // anchors store meter coordinates
      const ay = a.y * scaleY
      const ag = document.createElementNS(NS, 'g')
      ag.setAttribute('transform', `translate(${ax},${ay})`)
      ag.setAttribute('cursor', 'pointer')
      // allow pointer events on anchors
      ag.style.pointerEvents = 'auto'

      const circle = document.createElementNS(NS, 'circle')
      circle.setAttribute('r', String(pxToUnits(markerRadiusPx)))
      circle.setAttribute('fill', '#1d4ed8')
      circle.setAttribute('stroke', '#ffffff')
      circle.setAttribute('stroke-width', String(pxToUnits(markerStrokePx)))
      circle.setAttribute('vector-effect', 'non-scaling-stroke')
      ag.appendChild(circle)

      const txt = document.createElementNS(NS, 'text')
      txt.setAttribute('x', '0')
      txt.setAttribute('y', String(-pxToUnits(anchorLabelOffsetAbovePx)))
      txt.setAttribute('text-anchor', 'middle')
      txt.setAttribute('fill', '#0b2540')
      txt.setAttribute('font-size', String(pxToUnits(markerFontPx)))
      txt.textContent = anchorNames[a.beaconId] || a.beaconId
      ag.appendChild(txt)

      // events: mousedown -> start drag; click -> edit; contextmenu -> remove
      ag.addEventListener('mousedown', (e) => { e.preventDefault(); startAnchorDrag(idx, e) })
      ag.addEventListener('click', (e) => { e.stopPropagation(); const id = prompt('Edit beaconId', a.beaconId); if (!id) return; setAnchors(prev => prev.map((p, i) => i === idx ? { ...p, beaconId: id } : p)) })
      ag.addEventListener('contextmenu', (e) => { e.preventDefault(); setAnchors(prev => prev.filter((_, i) => i !== idx)) })

      g.appendChild(ag)
    })

    // devices (render as red circles with label below, constant on-screen size)
    employees.forEach(emp => {
      const ex = emp.x * scaleX // employees store meter coordinates
      const ey = emp.y * scaleY
      const dg = document.createElementNS(NS, 'g')
      dg.setAttribute('transform', `translate(${ex},${ey})`)
      dg.style.pointerEvents = 'auto'

      const circle = document.createElementNS(NS, 'circle')
      circle.setAttribute('r', String(pxToUnits(markerRadiusPx)))
      circle.setAttribute('fill', '#ef4444')
      circle.setAttribute('stroke', '#ffffff')
      circle.setAttribute('stroke-width', String(pxToUnits(markerStrokePx)))
      circle.setAttribute('vector-effect', 'non-scaling-stroke')
      dg.appendChild(circle)

      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x', '0')
      t.setAttribute('y', String(pxToUnits(deviceLabelOffsetBelowPx)))
      t.setAttribute('text-anchor', 'middle')
      t.setAttribute('fill', '#0b2540')
      t.setAttribute('font-size', String(pxToUnits(markerFontPx)))
      t.textContent = deviceNames[emp.id] || emp.label || emp.id
      dg.appendChild(t)

      g.appendChild(dg)
    })

    svgEl.appendChild(g)

    return () => { const ex = svgEl.querySelector('#react-overlay-group'); if (ex) ex.remove() }
  }, [image, anchors, employees, paths, svgViewBox, anchorNames, deviceNames, factoryWidthMeters, factoryHeightMeters])

  // clientToNormalized and normToPercent provided by useSvgPanZoom

  // Append a normalized point (0..1) to device path history
  function pushDevicePoint(deviceId, nx, ny) {
    if (!deviceId || isNaN(nx) || isNaN(ny)) return
    setPaths(prev => {
      const arr = prev[deviceId] ? prev[deviceId].concat([{ x: nx, y: ny, t: Date.now() }]) : [{ x: nx, y: ny, t: Date.now() }]
      const sliced = arr.length > MAX_PATH_POINTS ? arr.slice(arr.length - MAX_PATH_POINTS) : arr
      return { ...prev, [deviceId]: sliced }
    })
  }

  useEffect(() => {
    // save anchors and factory sizes
    localStorage.setItem('anchors', JSON.stringify(anchors))
    localStorage.setItem('factoryWidthMeters', String(factoryWidthMeters))
    localStorage.setItem('factoryHeightMeters', String(factoryHeightMeters))
    localStorage.setItem('anchorNames', JSON.stringify(anchorNames))
    localStorage.setItem('deviceNames', JSON.stringify(deviceNames))
    localStorage.setItem('smoothingMethod', smoothingMethod)
  }, [anchors, factoryWidthMeters, factoryHeightMeters, anchorNames, deviceNames, smoothingMethod])


  // Load runtime config once at mount. Only after resolving config do we set
  // pollUrl; this prevents the app from starting a connection to the wrong
  // (localhost) URL and then immediately reconnecting.
  // Load runtime config file once (backend port discovery) then derive streaming URL.
  useEffect(() => {
    let cancelled = false
      ; (async function () {
        try {
          const r = await fetch('/config.json', { cache: 'no-store' })
          if (!cancelled) {
            if (r.ok) {
              const cfg = await r.json()
              if (cfg && cfg.backendPort) {
                setBackendPort(cfg.backendPort)
                pushLog(`Loaded config.json backendPort=${cfg.backendPort}`)
                return
              }
            }
          }
        } catch (e) { /* ignore */ }
        // fallback if no config or fetch failed
        if (!cancelled) {
          setBackendPort(8080)
          pushLog('Using fallback backendPort=8080')
        }
      })()
    return () => { cancelled = true }
  }, [])

  // When backendPort or useLive changes, derive the pollUrl automatically.
  // Derive pollUrl when backend port or mode changes. Embeds mock perturbation parameters when not live.
  useEffect(() => {
    if (!backendPort) return
    const host = window.location.hostname
    const url = useLive
      ? `http://${host}:${backendPort}/proxy/uwbStream`
      : `http://${host}:${backendPort}/mock/stream?w=${encodeURIComponent(factoryWidthMeters)}&h=${encodeURIComponent(factoryHeightMeters)}&az=1.5&tz=1.5&tzAmp=0.2&tzHz=0.1&noise=0.05&outlierRate=0.05&outlierScale=1.8&dropRate=0.05&zeroRate=0.02`
    setPollUrl(url)
    pushLog(`pollUrl set to ${url} (useLive=${useLive})`)
  }, [backendPort, useLive, factoryWidthMeters, factoryHeightMeters])

  // clear per-device Kalman filters when anchors change (recalibration)
  // Reset per-device Kalman filter instances whenever anchors change (geometry shift invalidates previous filter state).
  useEffect(() => {
    kalmanRef.current = {}
    pushLog('Kalman filters reset due to anchor change')
  }, [anchors])

  // remove polling; both mock and live use streaming endpoints now

  // Unified streaming effect: connect to whichever `pollUrl` is active
  // Streaming connection management: opens SSE to `pollUrl` and parses incremental blocks.
  // Robust to multi-line JSON and ignores non-JSON frames (heartbeats/comments).
  useEffect(() => {
    let stopped = false
    async function startStream() {
      stopLiveStream()
      if (!pollUrl || view !== 'home') return
      try {
        setConnStatus('connecting')
        const headers = {}
        const ac = new AbortController()
        streamControllerRef.current = ac
        const res = await fetch(pollUrl, { headers, signal: ac.signal })
        if (!res.ok) { console.warn('Stream responded', res.status); return }
        setConnStatus('open')
        pushLog(`Connected to ${pollUrl}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          // parse SSE-like chunks separated by double-newline
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const raw = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const lines = raw.split(/\r?\n/)
            let dataLines = []
            for (const line of lines) {
              if (line.startsWith('data:')) dataLines.push(line.replace(/^data:\s*/, ''))
            }
            if (dataLines.length === 0) continue
            const dataText = dataLines.join('\n')
            try {
              const parsed = JSON.parse(dataText)
              if (parsed && parsed.type === 'uwb_update' && parsed.payload) { handleUwbUpdate(parsed.payload); pushLog(`recv uwb_update ${parsed.payload.deviceIdHex || parsed.payload.deviceId || ''}`) }
              else if (parsed && parsed.payload && parsed.payload.beacons) { handleUwbUpdate(parsed.payload); pushLog(`recv payload ${parsed.payload.deviceIdHex || parsed.payload.deviceId || ''}`) }
              else if (parsed && parsed.beacons) { handleUwbUpdate(parsed); pushLog(`recv beacons ${parsed.deviceIdHex || parsed.deviceId || ''}`) }
            } catch (err) { /* ignore non-JSON frames */ }
          }
          if (stopped) break
        }
        pushLog(`Stream closed from ${pollUrl}`)
        setConnStatus('closed')
      } catch (err) { if (err.name === 'AbortError') return; console.error('Stream error', err) }
    }

    function stopLiveStream() {
      const ac = streamControllerRef.current
      if (ac) { try { ac.abort() } catch (e) { }; streamControllerRef.current = null }
    }

    if (pollUrl) startStream()
    return () => { stopped = true; stopLiveStream() }
  }, [pollUrl, view])

  function pushLog(line) {
    setLogs(prev => ([...(prev || []).slice(-49), `${new Date().toLocaleTimeString()}: ${line}`]))
  }

  /**
   * Fetch from the configured pollUrl and dispatch to the appropriate handler.
   * Supports both the mocked `uwb_update` payload and an older `positions` array format.
   */
  async function fetchPositions() {
    try {
      // For mock polling we don't need special headers.
      const headers = {}
      if (!useLive && apiKey) headers['x-api-key'] = apiKey
      const res = await axios.get(pollUrl, { headers })
      const data = res.data
      // handle possible streaming- or array-wrapped responses
      if (data && data.type === 'uwb_update' && data.payload && data.payload.beacons) {
        handleUwbUpdate(data.payload)
      } else if (Array.isArray(data)) {
        // maybe an array of updates; process first for demo
        for (const d of data) { if (d && d.type === 'uwb_update' && d.payload) handleUwbUpdate(d.payload) }
      } else if (data && data.payload && data.payload.beacons) {
        handleUwbUpdate(data.payload)
      } else if (res.data.positions) {
        setEmployees(res.data.positions || [])
      }
    } catch (e) {
      console.error(e)
      // don't flood alerts during polling; show once
    }
  }

  /**
   * If anchorMode is active, adds an anchor at the clicked position (meters)
   * and prompts the user for the anchor's `beaconId`.
   */
  function onPlanClick(e) {
    if (!anchorMode) return
    if (!planRef.current) return
    const { x, y } = clientToUnits(e.clientX, e.clientY)
    const beaconId = window.prompt('Enter beaconId for this anchor (e.g. 020000b3):')
    if (!beaconId) return
    setAnchors(a => [...a, { beaconId, x, y }])
  }

  /**
   * Begin dragging an existing anchor. Attaches mousemove/mouseup handlers to
   * update the anchor position in meters while dragging.
   */
  function startAnchorDrag(i, e) {
    e.preventDefault();
    const onMove = (ev) => {
      if (!planRef.current) return
      const { x, y } = clientToUnits(ev.clientX, ev.clientY)
      setAnchors(prev => prev.map((it, idx) => idx === i ? { ...it, x, y } : it))
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
    document.body.style.cursor = 'grabbing'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * Given a UWB payload (payload.beacons array), run trilateration and update
   * the smoothed position for the device. The result is converted to normalized
   * coordinates relative to the configured factory dimensions.
   * @param {{deviceIdHex: string, beacons: Array}} payload
   */
  /**
   * Process decrypted UWB payload, apply trilateration and smoothing, then update device state.
   * Distances are provided in centimeters; converted to meters for solver.
   * Ignores frames with <3 usable beacons to prevent unstable solutions.
   */
  function handleUwbUpdate(payload) {
    // payload.beacons -> [{beaconId, distance}]
    // The live streaming API reports distances in centimeters.
    // Convert to meters when `useLive` is set. Local/mock endpoints are
    // expected to already return meters, so we leave them as-is.

    const id = payload.deviceIdHex || payload.deviceId || 'mock-device'

    // 1. Timestamp Filtering
    // Use requestTimestamp from payload if available, otherwise current time
    const ts = payload.requestTimestamp || payload.ts || Date.now()
    // If we have seen a newer packet for this device, ignore this one
    if (lastPacketTimestamp[id] && ts < lastPacketTimestamp[id]) {
      // pushLog(`ignoring out-of-order packet for ${id}`)
      return
    }
    setLastPacketTimestamp(prev => ({ ...prev, [id]: ts }))
    setLastPacketAt(Date.now())

    // 2. Anchors are already in meters
    const anchorsInMeters = anchors

    const rawDistances = (payload && Array.isArray(payload.beacons) ? payload.beacons : []).map(b => ({ beaconId: b.beaconId, distance: b.distance }))
    // Both mock and live streams provide distances in centimeters; convert to meters
    const distances = rawDistances.map(d => ({ ...d, distance: d.distance / 100 }))

    // 3. Z-axis Correction
    // Calculate horizontal distance: sqrt(slant^2 - dz^2)
    const dz = anchorHeight - tagHeight
    const correctedDistances = distances.map(d => {
      const slant = d.distance
      const dist2D = slant > Math.abs(dz) ? Math.sqrt(slant * slant - dz * dz) : 0
      return { ...d, distance: dist2D }
    })

    // Restrict to distances that correspond to known anchors and are finite
    const usable = correctedDistances.filter(d => anchorsInMeters.some(a => a.beaconId === d.beaconId) && Number.isFinite(d.distance) && d.distance >= 0)

    // Ignore updates when fewer than 3 beacons are present to avoid skewed results
    if (usable.length < 3) {
      // pushLog(`ignoring update: only ${usable.length} beacon(s) usable`)
      return
    }

    // If any measurement is exactly zero, prefer treating that as an anchor hit
    const hasZero = usable.some(d => d.distance === 0)
    const pos = trilaterate(anchorsInMeters, usable, { zeroIsAnchor: hasZero })

    if (!pos) {
      pushLog(`triangulation failed: anchors=${anchorsInMeters.length} beacons=${distances.length}`)
      setDebugInfo({ when: Date.now(), reason: 'triangulation-failed', anchorsInMeters, distancesCm: rawDistances, distancesM: usable, payload })
      return
    }

    // pos is in meters.
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      pushLog(`triangulation produced NaN: pos=(${pos.x?.toFixed?.(3) || pos.x},${pos.y?.toFixed?.(3) || pos.y})`)
      setDebugInfo({ when: Date.now(), reason: 'nan', posMeters: pos, anchorsInMeters, distancesCm: rawDistances, distancesM: distances, payload })
      return
    }

    // record raw result for debug overlay (pre-smoothing)
    const clamped = { x: Math.max(0, Math.min(factoryWidthMeters, pos.x)), y: Math.max(0, Math.min(factoryHeightMeters, pos.y)) }
    const nowTs = Date.now()
    setDebugInfo({ when: nowTs, posMeters: pos, clamped, anchorsInMeters, distancesCm: rawDistances, distancesM: distances, payload, smoothingMethod })
    setFrameCount(c => c + 1)

    // update FPS as frames per second over last 10s window
    const buf = frameTimesRef.current
    buf.push(nowTs)
    const cutoff = nowTs - 10000
    while (buf.length && buf[0] < cutoff) buf.shift()
    setFps(buf.length / 10)

    // smoothing and path history
    if (smoothingMethod === 'kalman') {
      // use per-device Kalman filters
      if (!kalmanRef.current[id]) kalmanRef.current[id] = new Kalman2D(0.0005, 0.002)
      const kf = kalmanRef.current[id]
      const filtered = kf.update(pos)
      setSmoothed(prev => ({ ...prev, [id]: filtered }))
      setEmployees([{ id, label: deviceNames[id] || id, x: filtered.x, y: filtered.y, t: Date.now() }])
      pushLog(`pos[kalman]: ${filtered.x.toFixed(3)}, ${filtered.y.toFixed(3)}`)
      pushDevicePoint(id, filtered.x, filtered.y)
    } else {
      // default EMA
      setSmoothed(prev => {
        const prevPos = prev[id]
        const newPos = prevPos ? {
          x: smoothingAlpha * pos.x + (1 - smoothingAlpha) * prevPos.x,
          y: smoothingAlpha * pos.y + (1 - smoothingAlpha) * prevPos.y
        } : pos
        const next = { ...prev, [id]: newPos }
        // update rendered employees list (use display name if available)
        setEmployees([{ id, label: deviceNames[id] || id, x: newPos.x, y: newPos.y, t: Date.now() }])
        pushLog(`pos[ema]: ${newPos.x.toFixed(3)}, ${newPos.y.toFixed(3)}`)
        // append to path history via helper
        pushDevicePoint(id, newPos.x, newPos.y)
        return next
      })
    }
  }

  function clearLines() {
    setPaths(prev => {
      const out = {}
      for (const k of Object.keys(prev)) {
        const arr = prev[k]
        if (arr && arr.length) out[k] = [arr[arr.length - 1]]
      }
      return out
    })
  }

  function clearAllLines() {
    setPaths({})
  }

  const deviceMetrics = useMemo(() => {
    const tagCount = Math.max(Object.keys(paths).length, employees.length)
    return {
      gateway: { online: 0, total: 0 },
      beacon: { online: anchors.length, total: Math.max(anchors.length, 3) },
      tag: { online: tagCount, total: tagCount }
    }
  }, [anchors.length, employees.length, paths])

  const formatUsage = (value) => {
    if (value === null || value === undefined || value === '') return '—'
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return `${parsed.toFixed(2)}%`
    return String(value)
  }

  const softwareVersion = import.meta.env.VITE_APP_VERSION || '0.1.0'
  const zoomPercent = image && typeof image === 'object' && image.type === 'svg' && svgViewBox
    ? `${Math.round(((image.width || svgViewBox.w) / (svgViewBox.w || 1)) * 100)}%`
    : '100%'
  const mapInfoItems = [
    { label: 'Current Select Layer', value: 'default' },
    { label: 'Zoom', value: zoomPercent },
    { label: 'Local', value: '—' },
    { label: 'LngLat', value: '—' },
    { label: 'FPS', value: typeof fps === 'number' ? fps.toFixed(2) : '—' },
    { label: 'Devices', value: employees.length },
  ]

  const formatElapsed = (timestamp) => {
    if (!timestamp) return '—'
    const diff = Date.now() - timestamp
    if (diff <= 0) return '—'
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    return `${Math.floor(minutes / 60)}h`
  }

  const deviceListRows = useMemo(() => {
    return employees.map(emp => ({
      uid: emp.id,
      name: emp.label,
      type: 'Tag',
      product: 'Pinpoint Tag',
      firmware: debugInfo?.firmware || softwareVersion,
      lastSeen: formatElapsed(emp.t)
    }))
  }, [employees, debugInfo, softwareVersion])

  const mapContent = (
    <div className="flex flex-col h-full w-full relative">
      <div className="grid-bg"></div>

      {/* Floating Right Toolbar */}
      <div className="floating-toolbar-right">
        <button className="floating-btn"><IconNavigation size={20} /></button>
        <button className="floating-btn"><IconLayersLinked size={20} /></button>
        <button className="floating-btn"><IconFocusCentered size={20} /></button>
        <button className="floating-btn"><IconBuilding size={20} /></button>
        <button className="floating-btn"><span style={{ fontWeight: 600 }}>N</span></button>
        <button className="floating-btn"><IconCompass size={20} /></button>
        <button className="floating-btn"><span style={{ fontWeight: 600 }}>S</span></button>
        <button className="floating-btn"><span style={{ fontSize: 12 }}>0°</span></button>
        <div style={{ marginTop: 'auto' }}></div>
        <button className="floating-btn"><IconArrowsMaximize size={20} /></button>
        <button className="floating-btn"><span style={{ fontSize: 12 }}>0°</span></button>
      </div>

      {/* Bottom Info Overlay */}
      <div className="map-info-overlay">
        <div className="info-line">Current Select Layer: default</div>
        <div className="info-line">Zoom: {(svgViewBox?.w ? (factoryWidthMeters / svgViewBox.w).toFixed(2) : '1.00')}</div>
        <div className="info-line">Local: [1.08, -31.49] m</div>
        <div className="info-line">LngLat: [113.948..., 22.545...]</div>
        <div className="info-line">FPS: {fps != null ? fps.toFixed(2) : '—'}</div>
      </div>

      {/* Zoom Controls (Bottom Right) */}
      <div className="zoom-controls-bottom">
        <button className="icon-btn" onClick={() => zoom(1.2)}><IconZoomIn size={18} /></button>
        <button className="icon-btn" onClick={() => zoom(0.8)}><IconZoomOut size={18} /></button>
        <button className="icon-btn" onClick={reset}><IconMaximize size={18} /></button>
      </div>

      <div className="plan-wrapper" ref={planRef}>
        <div className="planCanvas" ref={imgRef}>

          {/* SVG content rendered here */}
          {image ? (
            typeof image === 'string' ? (
              <img ref={imgRef} src={image} alt="plan" onLoad={() => setImageLoaded(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : image.type === 'svg' ? (
              <div ref={imgRef} dangerouslySetInnerHTML={{ __html: image.content }} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
            ) : (
              <img ref={imgRef} src={image} alt="plan" onLoad={() => setImageLoaded(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            )
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
              No plan loaded
            </div>
          )}

          {image && (
            <>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Path lines between tag positions */}
                {Object.keys(paths).map(deviceId => {
                  const arr = paths[deviceId] || []
                  if (arr.length < 2) return null

                  const points = arr.map(p => {
                    const pos = metersToPercent(p.x, p.y)
                    return `${pos.left},${pos.top}`
                  }).join(' ')

                  return (
                    <polyline
                      key={deviceId}
                      points={points}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2"
                      strokeOpacity="0.6"
                      vectorEffect="non-scaling-stroke"
                      className="drawSegment"
                    />
                  )
                })}
              </svg>
              {/* Re-inject existing overlays */}
              <svg id="overlay-layer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}></svg>

              <PlanAnchorsOverlay
                anchors={anchors}
                anchorNames={anchorNames}
                normToPercent={metersToPercent}
                onStartDrag={(idx, e) => startAnchorDrag(idx, e)}
                onEdit={(idx) => { const a = anchors[idx]; if (!a) return; const id = prompt('Edit beaconId', a.beaconId); if (!id) return; setAnchors(prev => prev.map((p, i) => i === idx ? { ...p, beaconId: id } : p)) }}
                onRemove={(idx) => setAnchors(prev => prev.filter((_, i) => i !== idx))}
              />

              <DevicesOverlay
                employees={employees}
                deviceNames={deviceNames}
                normToPercent={metersToPercent}
                onCenter={(id) => { /* TODO: center on device by adjusting viewBox in future */ }}
              />
            </>
          )}
        </div>
      </div>


    </div>
  )

  const deviceListMetricCards = [
    { label: 'Gateway Online / Total', value: `${deviceMetrics.gateway.online}/${deviceMetrics.gateway.total}` },
    { label: 'Beacon Online / Total', value: `${deviceMetrics.beacon.online}/${deviceMetrics.beacon.total}` },
    { label: 'Tag Online / Total', value: `${deviceMetrics.tag.online}/${deviceMetrics.tag.total}` }
  ]

  const deviceListFilters = [
    { label: 'Name / UID Suffix', type: 'text', placeholder: 'Please Input' },
    { label: 'Device Type', type: 'select', options: ['All', 'Tag', 'Beacon', 'Gateway'] },
    { label: 'Online Status', type: 'select', options: ['Online', 'Offline', 'All'] },
    { label: 'Exclude version', type: 'text', placeholder: 'Please Input' }
  ]

  const deviceListContent = (
    <div className="device-list-page">
      <div className="device-list-metric-row">
        {deviceListMetricCards.map(card => (
          <div key={card.label} className="metric-card device-list-metric-card">
            <span className="metric-label">{card.label}</span>
            <strong className="metric-value">{card.value}</strong>
          </div>
        ))}
      </div>
      <div className="device-list-toolbar">
        <div className="device-list-toolbar-actions">
          <button type="button" className="device-list-btn primary">Search</button>
          <button type="button" className="device-list-btn ghost">Reset</button>
          <button type="button" className="device-list-btn ghost">Export Device Data</button>
        </div>
        <div className="device-list-filter-grid">
          {deviceListFilters.map(field => (
            <div key={field.label} className="device-filter-group">
              <label>{field.label}</label>
              {field.type === 'select' ? (
                <select>
                  {field.options.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input type="text" placeholder={field.placeholder} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="device-table-card">
        <div className="device-table-header">
          <h3>Device List</h3>
          <div className="device-table-actions">
            <button type="button">Check Device Status</button>
            <button type="button">Firmware Upgrade</button>
            <button type="button">Batch Config Parameters</button>
            <button type="button">More Action</button>
          </div>
        </div>
        <div className="device-table-wrapper">
          <table className="device-table">
            <thead>
              <tr>
                <th>UID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Product</th>
                <th>Firmware Version</th>
                <th>Online/Offline Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deviceListRows.length ? deviceListRows.map(row => (
                <tr key={row.uid}>
                  <td>{row.uid}</td>
                  <td>{row.name}</td>
                  <td>{row.type}</td>
                  <td>{row.product}</td>
                  <td>{row.firmware}</td>
                  <td>{row.lastSeen}</td>
                  <td>
                    <button type="button" className="device-action-pill">Details</button>
                  </td>
                </tr>
              )) : (
                <tr className="empty-state">
                  <td colSpan="7">No devices streaming yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="device-table-footer">
          <div className="pagination-controls">
            <button type="button">‹</button>
            <span className="page-indicator">1</span>
            <button type="button">›</button>
            <span className="page-size">20 / pages</span>
          </div>
          <div className="device-table-stats">
            <span>Software Version:<strong>v{softwareVersion}</strong></span>
            <span>CPU Usage:<strong>{formatUsage(debugInfo?.cpu)}</strong></span>
            <span>Memory Usage:<strong>{formatUsage(debugInfo?.memory)}</strong></span>
            <span>Disk Usage:<strong>{formatUsage(debugInfo?.disk)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  )

  const mapManagementContent = (
    <div className="map-management-page">
      <div className="map-management-card">
        <h2>Map Management</h2>
        <p>Import, preview, and configure map layers, anchors, and plan metadata.</p>
        <div className="map-management-actions">
          <button type="button">Upload Map</button>
          <button type="button">Layer Controls</button>
          <button type="button">Export Settings</button>
        </div>
      </div>
    </div>
  )

  const currentPageContent = view === 'devices'
    ? deviceListContent
    : view === 'management'
      ? mapManagementContent
      : mapContent

  return (
    <div className="app-root">
      <TopBar
        onOpenAdmin={() => setAdminOpen(true)}
        onNavigate={(v) => setView(v)}
        currentView={view}
        backendPort={backendPort}
        pollUrl={pollUrl}
        useLive={useLive}
        setUseLive={setUseLive}
        connStatus={connStatus}
        onTogglePanel={() => setPanelOpen(v => !v)}
        fps={fps}
        lastPacketAt={lastPacketAt}
        panelOpen={panelOpen}
        deviceMetrics={deviceMetrics}
        debugInfo={debugInfo}
        anchors={anchors}
        factoryWidthMeters={factoryWidthMeters}
        factoryHeightMeters={factoryHeightMeters}
      >
        <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Admin Panel</DialogTitle>
              <DialogDescription>Configure application settings</DialogDescription>
            </DialogHeader>
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
              anchorHeight={anchorHeight}
              setAnchorHeight={setAnchorHeight}
              tagHeight={tagHeight}
              setTagHeight={setTagHeight}
              onClose={() => setAdminOpen(false)}
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
            />
          </DialogContent>
        </Dialog>

        {currentPageContent}
      </TopBar>
      <RightPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        anchors={anchors}
        employees={employees}
        logs={logs}
        debugInfo={debugInfo}
        frameCount={frameCount}
        showDebug={showDebug}
        setShowDebug={setShowDebug}

        onMockAnchors={resetCornerAnchors}
        anchorMode={anchorMode}
        setAnchorMode={setAnchorMode}
        showMiniMap={showMiniMap}
        setShowMiniMap={setShowMiniMap}
      />
    </div>
  )
}

export default App
