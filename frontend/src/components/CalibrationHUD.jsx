import React from 'react'
import * as Mantine from '@mantine/core'

/**
 * CalibrationHUD
 * Floating 3-point calibration panel.
 * Props:
 * - calPoints, setCalPoints
 * - calibration, setCalibration
 * - solveCalibration
 * - pushLog
 */
export default function CalibrationHUD({ calPoints, setCalPoints, calibration, setCalibration, solveCalibration, pushLog }){
  return (
    <div style={{ position:'absolute', right:16, top:16, zIndex:20, background:'rgba(255,255,255,0.95)', border:'1px solid rgba(0,0,0,0.08)', borderRadius:8, padding:10, width:300 }}>
      <Mantine.Text weight={600} size="sm">Calibration (3 points)</Mantine.Text>
      <Mantine.Text size="xs" color="dimmed">Click 3 points on the plan. Enter world X/Y in meters, then Solve.</Mantine.Text>
      <div style={{ marginTop:8 }}>
        {Array.from({length:3}).map((_,i)=>{
          const p = calPoints[i]
          return (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr', gap:6, alignItems:'center', marginBottom:6 }}>
              <span style={{fontSize:12, color:'#666'}}>P{i+1}</span>
              <input placeholder="X (m)" value={p?.wx??''} onChange={e=> setCalPoints(prev=>{ const c=[...prev]; if(!c[i]) c[i]={ nx:0,ny:0,wx:'',wy:'' }; c[i]={...c[i], wx: e.target.value }; return c })} style={{ padding:'4px 6px', fontSize:12 }} />
              <input placeholder="Y (m)" value={p?.wy??''} onChange={e=> setCalPoints(prev=>{ const c=[...prev]; if(!c[i]) c[i]={ nx:0,ny:0,wx:'',wy:'' }; c[i]={...c[i], wy: e.target.value }; return c })} style={{ padding:'4px 6px', fontSize:12 }} />
              <div style={{ gridColumn:'1 / span 3', fontSize:11, color:'#666' }}>screen: {p? `${p.nx.toFixed(3)}, ${p.ny.toFixed(3)}` : '—'}</div>
            </div>
          )
        })}
      </div>
      <Mantine.Group spacing="xs">
        <Mantine.Button size="xs" variant="outline" onClick={()=> setCalPoints([])}>Clear</Mantine.Button>
        <Mantine.Button size="xs" onClick={solveCalibration} disabled={calPoints.length!==3}>Solve</Mantine.Button>
        {calibration && <Mantine.Button size="xs" variant="light" color="red" onClick={()=>{ setCalibration(null); pushLog && pushLog('Calibration cleared') }}>Remove</Mantine.Button>}
      </Mantine.Group>
    </div>
  )
}
