import React, { useState, useEffect } from 'react'

export default function Admin({ anchors, setAnchors, anchorNames, setAnchorNames, deviceNames, setDeviceNames, factoryWidthMeters, factoryHeightMeters, setFactoryWidthMeters, setFactoryHeightMeters, onClose }){
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
