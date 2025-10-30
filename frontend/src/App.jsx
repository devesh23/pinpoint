import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { trilaterate } from './triangulation'
import { TopBar } from './components/Layout.jsx'
import Admin from './components/Admin'
import { Kalman2D } from './kalman'
import { Container, Grid, Card, Group, Button, Text, FileInput, NumberInput, Stack, Tooltip, Popover, ActionIcon, Badge } from '@mantine/core'
import { IconUpload, IconMapPin, IconUsers, IconSettings, IconEdit, IconTrash } from '@tabler/icons-react'

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
  const [apiKey, setApiKey] = useState('')
  const [useLive, setUseLive] = useState(false)
  // pollUrl controls the stream endpoint; default to backend mock stream.
  // We attempt to load `/config.json` (created by quickstart.sh) so that the
  // built static site can learn the backend port chosen for docker-compose.
  const [pollUrl, setPollUrl] = useState('http://localhost:8080/mock/stream')
  const [pollIntervalSec, setPollIntervalSec] = useState(30)
  const [employees, setEmployees] = useState([])
  const [image, setImage] = useState(null)
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

  // Anchors stored as normalized coordinates (0..1) and beaconId; meters computed from factory dims
  const [anchors, setAnchors] = useState(()=>{
    try{ const s = localStorage.getItem('anchors'); return s ? JSON.parse(s) : [
      { beaconId: '020000b3', x: 0.05, y: 0.1 },
      { beaconId: '02000053', x: 0.5, y: 0.12 },
      { beaconId: '020000e6', x: 0.35, y: 0.6 }
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
  const MAX_PATH_POINTS = 500

  // helpers
  const anchorsInMeters = anchors.map(a=>({ beaconId: a.beaconId, x: a.x * factoryWidthMeters, y: a.y * factoryHeightMeters }))

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
    // Try to load runtime config (written into frontend/public/config.json by quickstart)
    (async function(){
      try{
        const r = await fetch('/config.json', { cache: 'no-store' })
        if(r.ok){
          const cfg = await r.json()
          if(cfg && cfg.backendPort){
            setPollUrl(`http://${window.location.hostname}:${cfg.backendPort}/mock/stream`)
            pushLog(`Loaded config.json backendPort=${cfg.backendPort}`)
          }
        }
      }catch(e){ /* ignore */ }
    })()

    // save anchors and factory sizes
    localStorage.setItem('anchors', JSON.stringify(anchors))
    localStorage.setItem('factoryWidthMeters', String(factoryWidthMeters))
    localStorage.setItem('factoryHeightMeters', String(factoryHeightMeters))
    localStorage.setItem('anchorNames', JSON.stringify(anchorNames))
    localStorage.setItem('deviceNames', JSON.stringify(deviceNames))
    localStorage.setItem('smoothingMethod', smoothingMethod)
  }, [anchors, factoryWidthMeters, factoryHeightMeters, anchorNames, deviceNames])

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

  // Anchor interaction: add or drag
  const [anchorMode, setAnchorMode] = useState(false)
  /**
   * If anchorMode is active, adds an anchor at the clicked normalized position
   * and prompts the user for the anchor's `beaconId`.
   */
  function onPlanClick(e){
    if(!anchorMode) return
    if(!planRef.current) return
    const rect = planRef.current.getBoundingClientRect()
    const cx = (e.clientX - rect.left) / rect.width
    const cy = (e.clientY - rect.top) / rect.height
    const beaconId = window.prompt('Enter beaconId for this anchor (e.g. 020000b3):')
    if(!beaconId) return
    setAnchors(a=>[...a, { beaconId, x: Math.max(0,Math.min(1,cx)), y: Math.max(0,Math.min(1,cy)) }])
  }

  /**
   * Begin dragging an existing anchor. Attaches mousemove/mouseup handlers to
   * update the anchor position in normalized coordinates while dragging.
   */
  function startAnchorDrag(i, e){
    e.preventDefault();
    // use the plan container rect for robust coordinates (image may resize/load)
    const onMove = (ev)=>{
      if(!planRef.current) return
  const rect = planRef.current.getBoundingClientRect()
  const nx = Math.max(0,Math.min(1,(ev.clientX - rect.left)/rect.width))
  const ny = Math.max(0,Math.min(1,(ev.clientY - rect.top)/rect.height))
  setAnchors(prev => prev.map((it, idx)=> idx===i ? { ...it, x: nx, y: ny } : it))
    }
    const onUp = ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
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
  function handleUwbUpdate(payload){
    // payload.beacons -> [{beaconId, distance}]
    // The live streaming API reports distances in centimeters.
    // Convert to meters when `useLive` is set. Local/mock endpoints are
    // expected to already return meters, so we leave them as-is.
    const rawDistances = payload.beacons.map(b => ({ beaconId: b.beaconId, distance: b.distance }))
    // Both mock and live streams provide distances in centimeters; convert to meters
    const distances = rawDistances.map(d => ({ ...d, distance: d.distance / 100 }))
    const pos = trilaterate(anchorsInMeters, distances)
    if(!pos) return
    const norm = { x: pos.x / factoryWidthMeters, y: pos.y / factoryHeightMeters }

    // smoothing and path history
    const id = payload.deviceIdHex || payload.deviceId || 'mock-device'
  if(smoothingMethod === 'kalman'){
      // use per-device Kalman filters
      if(!kalmanRef.current[id]) kalmanRef.current[id] = new Kalman2D(0.0005, 0.002)
      const kf = kalmanRef.current[id]
      const filtered = kf.update(norm)
      setSmoothed(prev => ({ ...prev, [id]: filtered }))
      setEmployees([{ id, label: deviceNames[id]||id, x: filtered.x, y: filtered.y, t: Date.now() }])
      pushDevicePoint(id, filtered.x, filtered.y)
    } else {
      // default EMA
      setSmoothed(prev => {
        const prevPos = prev[id]
        const newPos = prevPos ? {
          x: smoothingAlpha*norm.x + (1-smoothingAlpha)*prevPos.x,
          y: smoothingAlpha*norm.y + (1-smoothingAlpha)*prevPos.y
        } : norm
        const next = { ...prev, [id]: newPos }
  // update rendered employees list (use display name if available)
  setEmployees([{ id, label: deviceNames[id]||id, x: newPos.x, y: newPos.y, t: Date.now() }])
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
    <div className="app">
      <TopBar onOpenAdmin={()=>setView('admin')} />

      <Container fluid style={{ padding: 18 }}>
        <Grid gutter="xl">
        {view === 'admin' && (
          <Grid.Col span={12}>
            <Card radius="md" p="md">
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
            </Card>
          </Grid.Col>
        )}

  <Grid.Col span={12}>
          <Card radius="md" p="md" shadow="sm">
            <Group position="apart" mb="sm">
              <Group spacing="xs">
                <IconMapPin size={18} />
                <Text weight={600}>Factory Plan</Text>
              </Group>
              <Group>
                <FileInput placeholder="Upload plan image" accept="image/*" onChange={(f)=>{ if(!f) return; setImage(URL.createObjectURL(f)); }} />
                <Button variant="light" onClick={()=>setImage('default-plan.svg')}>Use Default Plan</Button>
                <Button color={anchorMode ? 'red' : 'blue'} onClick={()=>setAnchorMode(m=>!m)}>{anchorMode ? 'Exit Anchor Mode' : 'Enter Anchor Mode'}</Button>
              </Group>
            </Group>

            <div className="planCanvas" onClick={onPlanClick} ref={planRef}>
              {image ? <img ref={imgRef} src={image} alt="plan" /> : <div className="empty">No plan loaded</div>}

              {/* SVG path layer */}
              <svg className="pathLayer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                {Object.keys(paths).map(deviceId => {
                  const arr = paths[deviceId] || []
                  const pts = arr.map(p=> `${(p.x*1000).toFixed(1)},${(p.y*1000).toFixed(1)}`).join(' ')
                  const lastIdx = arr.length - 1
                  const hasSegment = arr.length >= 2
                  let seg = null
                  if(hasSegment){
                    const a = arr[lastIdx-1]
                    const b = arr[lastIdx]
                    const x1 = (a.x*1000).toFixed(1), y1 = (a.y*1000).toFixed(1)
                    const x2 = (b.x*1000).toFixed(1), y2 = (b.y*1000).toFixed(1)
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
              {image && anchors.map((a, idx)=> {
                const left = `${a.x*100}%`, top = `${a.y*100}%`
                return (
                  <div key={a.beaconId + idx} className="overlay-anchor" style={{ position:'absolute', left, top, transform:'translate(-50%,-50%)', zIndex:4 }}>
                    <Tooltip label={anchorNames[a.beaconId] || a.beaconId} withArrow position="right">
                      <ActionIcon size="lg" variant="filled" color="blue" onMouseDown={(e)=>startAnchorDrag(idx,e)} aria-label="drag-anchor">
                        <IconMapPin size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Group spacing={6} style={{ marginTop:6, justifyContent:'center' }}>
                      <ActionIcon size="xs" variant="light" onClick={()=>{ const id = prompt('Edit beaconId', a.beaconId); if(!id) return; setAnchors(prev=> prev.map((p,i)=> i===idx? {...p, beaconId: id } : p)) }} aria-label="edit-anchor">
                        <IconEdit size={14} />
                      </ActionIcon>
                      <ActionIcon size="xs" color="red" variant="light" onClick={()=> setAnchors(prev=> prev.filter((_,i)=> i!==idx)) } aria-label="remove-anchor">
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </div>
                )
              })}

              {/* employees overlay */}
              {image && employees.map(emp=> {
                const left = `${emp.x*100}%`, top = `${emp.y*100}%`
                const lastSeen = emp.t ? new Date(emp.t).toLocaleTimeString() : new Date().toLocaleTimeString()
                return (
                  <div key={emp.id} className="overlay-device" style={{ position:'absolute', left, top, transform:'translate(-50%,-50%)', zIndex:5 }}>
                    <Popover width={220} position="right" withArrow>
                      <Popover.Target>
                        <Badge color="red" radius="xl" variant="filled" style={{ cursor:'pointer' }}>{deviceNames[emp.id]||emp.label||emp.id}</Badge>
                      </Popover.Target>
                      <Popover.Dropdown>
                        <Text size="sm" weight={600}>{deviceNames[emp.id]||emp.label||emp.id}</Text>
                        <Text size="xs" color="dimmed">Last seen: {lastSeen}</Text>
                        <Button variant="outline" size="xs" mt="sm" onClick={()=>{ /* future: center map on device */ }}>Center</Button>
                      </Popover.Dropdown>
                    </Popover>
                  </div>
                )
              })}
            </div>
          </Card>
  </Grid.Col>

  {/* Bottom row: Anchors (left) and Latest Positions (right) to free up vertical space for the plan */}
  <Grid.Col span={8}>
    <Card radius="md" p="md">
      <Group position="apart"><Text weight={600}>Anchors</Text></Group>
      <Group mt="sm">
        <NumberInput label="Width (m)" value={factoryWidthMeters} onChange={(v)=>setFactoryWidthMeters(v||0)} />
        <NumberInput label="Height (m)" value={factoryHeightMeters} onChange={(v)=>setFactoryHeightMeters(v||0)} />
      </Group>
      <ol style={{ marginTop: 12 }}>
        {anchors.map((a,idx)=> (
          <li key={a.beaconId+idx} style={{ marginBottom:6 }}>
            <strong>{a.beaconId}</strong> — x: {a.x.toFixed(3)}, y: {a.y.toFixed(3)}
            <Button variant="subtle" size="xs" style={{ marginLeft:8 }} onClick={()=>{ const id = prompt('Edit beaconId', a.beaconId); if(!id) return; setAnchors(prev=> prev.map((p,i)=> i===idx? {...p, beaconId: id } : p)) }}>Edit</Button>
            <Button variant="light" size="xs" style={{ marginLeft:6 }} onClick={()=> setAnchors(prev=> prev.filter((_,i)=> i!==idx)) }>Remove</Button>
          </li>
        ))}
      </ol>
      <Group mt="sm">
        <Button onClick={()=>{ setAnchors([]); setSmoothed({}); setEmployees([]); kalmanRef.current = {} }}>Clear Anchors</Button>
        <Button variant="light" onClick={()=>{ kalmanRef.current = {}; pushLog('Kalman filters manually reset') }}>Reset Kalman Filters</Button>
      </Group>
    </Card>
  </Grid.Col>

  <Grid.Col span={4}>
    <Card radius="md" p="md">
      <Group position="apart" align="center">
        <Group spacing="xs"><IconUsers size={18} /><Text weight={600}>Latest Positions</Text></Group>
      </Group>
      <pre className="json">{JSON.stringify(employees, null, 2)}</pre>
    </Card>
  </Grid.Col>
      </Grid>
    </Container>
    </div>
  )
}

export default App
