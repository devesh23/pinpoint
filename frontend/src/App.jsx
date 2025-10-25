import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { trilaterate } from './triangulation'
import { TopBar } from './components/Layout'

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
  const [apiKey, setApiKey] = useState('demo-key-123')
  const [useLive, setUseLive] = useState(false)
  // pollUrl is editable; toggles set sensible defaults
  const [pollUrl, setPollUrl] = useState('http://localhost:8080/positions')
  const [pollIntervalSec, setPollIntervalSec] = useState(30)
  const [polling, setPolling] = useState(true)
  const [employees, setEmployees] = useState([])
  const [image, setImage] = useState(null)
  const imgRef = useRef()
  const pollRef = useRef()

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

  // helpers
  const anchorsInMeters = anchors.map(a=>({ beaconId: a.beaconId, x: a.x * factoryWidthMeters, y: a.y * factoryHeightMeters }))

  useEffect(()=>{
    // save anchors and factory sizes
    localStorage.setItem('anchors', JSON.stringify(anchors))
    localStorage.setItem('factoryWidthMeters', String(factoryWidthMeters))
    localStorage.setItem('factoryHeightMeters', String(factoryHeightMeters))
  }, [anchors, factoryWidthMeters, factoryHeightMeters])

  useEffect(()=>{
    // handle polling interval
    async function doPoll(){ await fetchPositions() }
    if(polling){
      doPoll()
      pollRef.current = setInterval(doPoll, Math.max(1,pollIntervalSec)*1000)
    }
    return ()=> clearInterval(pollRef.current)
  }, [pollUrl, apiKey, polling, pollIntervalSec, useLive, anchors, factoryWidthMeters, factoryHeightMeters])

  /**
   * Fetch from the configured pollUrl and dispatch to the appropriate handler.
   * Supports both the mocked `uwb_update` payload and an older `positions` array format.
   */
  async function fetchPositions(){
    try{
      const res = await axios.get(pollUrl, { headers: { 'x-api-key': apiKey } })
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
    const distances = payload.beacons.map(b => ({ beaconId: b.beaconId, distance: b.distance }))
    const pos = trilaterate(anchorsInMeters, distances)
    if(!pos) return
    const norm = { x: pos.x / factoryWidthMeters, y: pos.y / factoryHeightMeters }

    // smoothing EMA
    setSmoothed(prev => {
      const prevPos = prev[payload.deviceIdHex]
      const newPos = prevPos ? {
        x: smoothingAlpha*norm.x + (1-smoothingAlpha)*prevPos.x,
        y: smoothingAlpha*norm.y + (1-smoothingAlpha)*prevPos.y
      } : norm
      const next = { ...prev, [payload.deviceIdHex]: newPos }
      // update rendered employees list
      setEmployees([{ id: payload.deviceIdHex, label: payload.deviceIdHex, x: newPos.x, y: newPos.y }])
      return next
    })
  }

  return (
    <div className="app">
      <TopBar apiKey={apiKey} setApiKey={setApiKey} pollUrl={pollUrl} setPollUrl={setPollUrl} fetchNow={fetchPositions} />

      <main className="main">
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

              {/* anchors overlay */}
              {image && anchors.map((a, idx)=> (
                <div key={a.beaconId + idx} className="router" style={{ position:'absolute', left:`${a.x*100}%`, top:`${a.y*100}%`, transform:'translate(-50%,-50%)' }} onMouseDown={(e)=>startAnchorDrag(idx,e)}>
                  <div style={{ fontSize:11 }}>{a.beaconId}</div>
                </div>
              ))}

              {/* employees overlay */}
              {image && employees.map(emp=> (
                <div key={emp.id} className="dot" style={{ left:`${emp.x*100}%`, top:`${emp.y*100}%` }}>{emp.label||emp.id}</div>
              ))}
            </div>
          </div>
        </section>

        <aside className="right">
          <div className="panel">
            <h3>Latest Positions</h3>
            <pre className="json">{JSON.stringify(employees, null, 2)}</pre>
          </div>

          <div className="panel">
            <h4>Polling & Mode</h4>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <label><input type="checkbox" checked={useLive} onChange={e=>{
                const v = e.target.checked; setUseLive(v); setPollUrl(v? 'http://52.15.252.22:8080/v1/uwbDataStream' : 'http://localhost:8080/positions')
              }} /> Live</label>
              <label>Interval (s): <input type="number" value={pollIntervalSec} onChange={e=>setPollIntervalSec(Number(e.target.value))} style={{ width:80 }} /></label>
              <label style={{ marginLeft:8 }}><input type="checkbox" checked={polling} onChange={e=>setPolling(e.target.checked)} /> Continuous Polling</label>
              <button className="btn" onClick={()=>setPolling(p=>!p)}>{polling? 'Pause' : 'Resume'}</button>
              <button className="btn muted" onClick={()=>fetchPositions()}>Fetch Now</button>
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
              <button className="btn" onClick={()=>{ setAnchors([]); setSmoothed({}); setEmployees([]) }}>Clear Anchors</button>
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
