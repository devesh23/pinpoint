import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { trilaterate } from './triangulation'
import { TopBar } from './components/Layout.jsx'
import Admin from './components/Admin'
import { Kalman2D } from './kalman'

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
  // pollUrl controls the stream endpoint; default to backend mock stream
  const [pollUrl, setPollUrl] = useState('http://localhost:8080/mock/stream')
  const [pollIntervalSec, setPollIntervalSec] = useState(30)
  const [employees, setEmployees] = useState([])
  const [image, setImage] = useState(null)
  const imgRef = useRef()
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

  // helpers
  const anchorsInMeters = anchors.map(a=>({ beaconId: a.beaconId, x: a.x * factoryWidthMeters, y: a.y * factoryHeightMeters }))

  useEffect(()=>{
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
    if(!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
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
    const onMove = (ev)=>{
      if(!imgRef.current) return
      const rect = imgRef.current.getBoundingClientRect()
      const nx = Math.max(0,Math.min(1,(ev.clientX - rect.left)/rect.width))
      const ny = Math.max(0,Math.min(1,(ev.clientY - rect.top)/rect.height))
      setAnchors(prev => prev.map((it, idx)=> idx===i ? { ...it, x: nx, y: ny } : it))
    }
    const onUp = ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
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
    if(smoothingMethod === 'kalman'){
      // use per-device Kalman filters
      const id = payload.deviceIdHex
      if(!kalmanRef.current[id]) kalmanRef.current[id] = new Kalman2D(0.0005, 0.002)
      const kf = kalmanRef.current[id]
      const filtered = kf.update(norm)
      setSmoothed(prev => ({ ...prev, [id]: filtered }))
      setEmployees([{ id, label: deviceNames[id]||id, x: filtered.x, y: filtered.y }])
      setPaths(prevP => {
        const cur = prevP[id] || []
        const appended = [...cur, filtered].slice(-200)
        return { ...prevP, [id]: appended }
      })
    } else {
      // default EMA
      setSmoothed(prev => {
        const prevPos = prev[payload.deviceIdHex]
        const newPos = prevPos ? {
          x: smoothingAlpha*norm.x + (1-smoothingAlpha)*prevPos.x,
          y: smoothingAlpha*norm.y + (1-smoothingAlpha)*prevPos.y
        } : norm
        const next = { ...prev, [payload.deviceIdHex]: newPos }
        // update rendered employees list (use display name if available)
        setEmployees([{ id: payload.deviceIdHex, label: deviceNames[payload.deviceIdHex]||payload.deviceIdHex, x: newPos.x, y: newPos.y }])
        // append to path history
        setPaths(prevP => {
          const cur = prevP[payload.deviceIdHex] || []
          const appended = [...cur, newPos].slice(-200)
          return { ...prevP, [payload.deviceIdHex]: appended }
        })
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

  return (
    <div className="app">
  <TopBar apiKey={apiKey} setApiKey={setApiKey} pollUrl={pollUrl} setPollUrl={setPollUrl} fetchNow={fetchPositions} hideControls={useLive} onOpenAdmin={()=>setView('admin')} />

      <main className="main">
        {view === 'admin' && (
          <section style={{ flex:1 }}>
            <div className="planCard">
              <Admin anchors={anchors} setAnchors={setAnchors} anchorNames={anchorNames} setAnchorNames={setAnchorNames} deviceNames={deviceNames} setDeviceNames={setDeviceNames} factoryWidthMeters={factoryWidthMeters} factoryHeightMeters={factoryHeightMeters} setFactoryWidthMeters={setFactoryWidthMeters} setFactoryHeightMeters={setFactoryHeightMeters} onClose={()=>setView('home')} />
            </div>
          </section>
        )}
        <section className="left">
          <div className="planCard">
            <div className="planControls">
              <input type="file" accept="image/*" onChange={e=>{
                const f = e.target.files[0]; if(!f) return; setImage(URL.createObjectURL(f))
              }} />
              <button className="btn muted" onClick={()=>setImage('/default-plan.svg')}>Use Default Plan</button>
              <button className={"btn" + (anchorMode ? ' muted' : '')} onClick={()=>setAnchorMode(m=>!m)} style={{ marginLeft:8 }}>{anchorMode ? 'Exit Anchor Mode' : 'Enter Anchor Mode'}</button>
            </div>

            <div className="planCanvas" onClick={onPlanClick}>
              {image ? <img ref={imgRef} src={image} alt="plan" /> : <div className="empty">No plan loaded</div>}

              {/* SVG path layer */}
              <svg className="pathLayer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                {Object.keys(paths).map(deviceId => {
                  const pts = (paths[deviceId]||[]).map(p=> `${(p.x*1000).toFixed(1)},${(p.y*1000).toFixed(1)}`).join(' ')
                  if(!pts) return null
                  return <polyline key={deviceId} points={pts} fill="none" stroke="#ef4444" strokeWidth="3" strokeOpacity="0.85" />
                })}
              </svg>

              {/* anchors overlay */}
              {image && anchors.map((a, idx)=> (
                <div key={a.beaconId + idx} className="router" style={{ position:'absolute', left:`${a.x*100}%`, top:`${a.y*100}%` }} onMouseDown={(e)=>startAnchorDrag(idx,e)}>
                  <div style={{ fontSize:11 }}>{anchorNames[a.beaconId] || a.beaconId}</div>
                </div>
              ))}

              {/* employees overlay */}
              {image && employees.map(emp=> (
                <React.Fragment key={emp.id}>
                  <div className="dot" style={{ left:`${emp.x*100}%`, top:`${emp.y*100}%` }} />
                  <div className="label" style={{ left:`${emp.x*100}%`, top:`${emp.y*100 + 2}%` }}>{emp.label||emp.id}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        <aside className="right">
          <div className="panel">
            <h3>Connection</h3>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:12, height:12, borderRadius:6, background: connStatus === 'open' ? '#22c55e' : connStatus === 'connecting' ? '#f59e0b' : '#ef4444' }} />
              <div>{connStatus}</div>
            </div>
            <h4 style={{ marginTop:12 }}>Event Log</h4>
            <div style={{ maxHeight:120, overflow:'auto', background:'#0b1220', color:'#cbd5e1', padding:8, fontSize:12, borderRadius:6 }}>
              {logs.length === 0 ? <div className="muted">No events yet</div> : logs.slice().reverse().map((l,i)=>(<div key={i}>{l}</div>))}
            </div>
          </div>

          <div className="panel">
            <h3>Latest Positions</h3>
            <pre className="json">{JSON.stringify(employees, null, 2)}</pre>
          </div>

          <div className="panel">
            <h4>Mode</h4>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexDirection:'column' }}>
              <label style={{ width:'100%' }}><input type="checkbox" checked={useLive} onChange={e=>{
                const v = e.target.checked; setUseLive(v); setPollUrl(v? 'http://localhost:8080/proxy/uwbStream' : 'http://localhost:8080/mock/stream')
              }} /> Use Live Stream</label>
              {!useLive && <div className="muted">Mock streaming active — updates every 30s</div>}
              {useLive && <div className="muted">Live streaming active (using refresh token flow). Dev controls hidden.</div>}
              <div style={{ width:'100%', marginTop:6 }}>
                <label style={{ display:'block', fontSize:13, marginBottom:6 }}>Smoothing:</label>
                <select value={smoothingMethod} onChange={e=>setSmoothingMethod(e.target.value)} style={{ width: '100%' }}>
                  <option value="ema">EMA (fast)</option>
                  <option value="kalman">Kalman (smooth)</option>
                </select>
              </div>
              <div style={{ marginTop:8 }}>
                <button className="btn muted" onClick={()=>clearLines()}>Clear Lines</button>
              </div>
            </div>
          </div>

          <div className="panel">
            <h4>Anchors</h4>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <label>Width (m): <input type="number" value={factoryWidthMeters} onChange={e=>setFactoryWidthMeters(Number(e.target.value))} style={{ width:80 }} /></label>
              <label>Height (m): <input type="number" value={factoryHeightMeters} onChange={e=>setFactoryHeightMeters(Number(e.target.value))} style={{ width:80 }} /></label>
            </div>
            <ol>
              {anchors.map((a,idx)=> (
                <li key={a.beaconId+idx} style={{ marginBottom:6 }}>
                  <strong>{a.beaconId}</strong> — x: {a.x.toFixed(3)}, y: {a.y.toFixed(3)}
                  <button className="btn muted" style={{ marginLeft:8 }} onClick={()=>{
                    // edit beaconId
                    const id = prompt('Edit beaconId', a.beaconId); if(!id) return; setAnchors(prev=> prev.map((p,i)=> i===idx? {...p, beaconId: id } : p))
                  }}>Edit</button>
                  <button className="btn" style={{ marginLeft:6 }} onClick={()=> setAnchors(prev=> prev.filter((_,i)=> i!==idx)) }>Remove</button>
                </li>
              ))}
            </ol>
            <div style={{ marginTop:8 }}>
              <button className="btn" onClick={()=>{ setAnchors([]); setSmoothed({}); setEmployees([]); kalmanRef.current = {} }}>Clear Anchors</button>
              <button className="btn muted" style={{ marginLeft:8 }} onClick={()=>{ kalmanRef.current = {}; pushLog('Kalman filters manually reset') }}>Reset Kalman Filters</button>
            </div>
          </div>

          <div className="panel muted">
            <h4>Help</h4>
            <p>Toggle <em>Anchor Mode</em>, then click on the plan to add anchors. Drag anchors to adjust. Anchors are stored in localStorage.</p>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
