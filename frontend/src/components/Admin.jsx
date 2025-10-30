import React, { useState, useEffect } from 'react'

export default function Admin({ anchors, setAnchors, anchorNames, setAnchorNames, deviceNames, setDeviceNames, factoryWidthMeters, factoryHeightMeters, setFactoryWidthMeters, setFactoryHeightMeters, onClose, apiKey, setApiKey, pollUrl, setPollUrl, useLive, setUseLive, smoothingMethod, setSmoothingMethod, connStatus, logs, fetchNow, clearLines, clearAllLines }){
  const [localAnchors, setLocalAnchors] = useState(anchors)
  useEffect(()=> setLocalAnchors(anchors), [anchors])

  function save(){
    setAnchors(localAnchors)
    onClose()
  }

  return (
    <div style={{ padding:20 }}>
      <h2>Admin</h2>
      <div style={{ marginBottom:12 }}>
        <label>Factory Width (m): <input type="number" value={factoryWidthMeters} onChange={e=>setFactoryWidthMeters(Number(e.target.value))} /></label>
        <label style={{ marginLeft:12 }}>Factory Height (m): <input type="number" value={factoryHeightMeters} onChange={e=>setFactoryHeightMeters(Number(e.target.value))} /></label>
      </div>

      <div style={{ marginBottom:12 }}>
        <h4>Connection & Stream</h4>
        <p className="muted">Configure API key, poll URL, streaming mode and smoothing.</p>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
          <input className="input" value={apiKey||''} onChange={e=>setApiKey(e.target.value)} placeholder="API Key (optional)" />
          <input className="input wide" value={pollUrl||''} onChange={e=>setPollUrl(e.target.value)} placeholder="Poll URL" />
        </div>
        <div style={{ marginTop:8 }}>
          <label style={{ display:'inline-flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={!!useLive} onChange={e=>setUseLive(e.target.checked)} /> Use Live Stream</label>
          <div style={{ marginTop:8 }}>
            <label style={{ display:'block', fontSize:13, marginBottom:6 }}>Smoothing:</label>
            <select value={smoothingMethod||'ema'} onChange={e=>setSmoothingMethod(e.target.value)}>
              <option value="ema">EMA (fast)</option>
              <option value="kalman">Kalman (smooth)</option>
            </select>
          </div>
          <div style={{ marginTop:8 }}>
            <button className="btn" onClick={fetchNow}>Fetch Now</button>
            <button className="btn muted" style={{ marginLeft:8 }} onClick={clearLines}>Clear Lines (preserve last)</button>
            <button className="btn" style={{ marginLeft:8 }} onClick={clearAllLines}>Clear All Lines</button>
          </div>
        </div>

        <div style={{ marginTop:12 }}>
          <h5>Connection Status</h5>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:6, background: connStatus === 'open' ? '#22c55e' : connStatus === 'connecting' ? '#f59e0b' : '#ef4444' }} />
            <div>{connStatus}</div>
          </div>

          <h5 style={{ marginTop:12 }}>Event Log</h5>
          <div style={{ maxHeight:200, overflow:'auto', background:'#0b1220', color:'#cbd5e1', padding:8, fontSize:12, borderRadius:6 }}>
            {(!logs || logs.length === 0) ? <div className="muted">No events yet</div> : logs.slice().reverse().map((l,i)=>(<div key={i}>{l}</div>))}
          </div>
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <h4>Anchor display names</h4>
        <p className="muted">Assign friendly names to anchors (beacon ids)</p>
        <ul>
          {anchors.map(a=> (
            <li key={a.beaconId} style={{ marginBottom:6 }}>
              <strong>{a.beaconId}</strong>: <input value={anchorNames[a.beaconId]||''} onChange={e=> setAnchorNames(prev=>({ ...prev, [a.beaconId]: e.target.value }))} />
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom:12 }}>
        <h4>Device display names</h4>
        <p className="muted">Assign friendly names to tracked devices when known.</p>
        <ul>
          {Object.keys(deviceNames||{}).map(d => (
            <li key={d} style={{ marginBottom:6 }}>
              <strong>{d}</strong>: <input value={deviceNames[d]||''} onChange={e=> setDeviceNames(prev=>({ ...prev, [d]: e.target.value }))} />
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop:12 }}>
        <button className="btn" onClick={save}>Save</button>
        <button className="btn muted" onClick={onClose} style={{ marginLeft:8 }}>Cancel</button>
      </div>
    </div>
  )
}
