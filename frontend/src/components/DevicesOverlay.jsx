import React from 'react'
import * as Mantine from '@mantine/core'

/**
 * DevicesOverlay
 * Renders device badges with popovers on raster images.
 * Props:
 * - employees: Array<{ id, label, x, y, t }>
 * - deviceNames: Record<string,string>
 * - normToPercent: (nx, ny) => { left, top }
 * - onCenter?: (id:string) => void
 */
export default function DevicesOverlay({ employees, deviceNames, normToPercent, onCenter }){
  return (
    <>
      {(employees||[]).map(emp=> {
        const pos = normToPercent(emp.x, emp.y)
        const left = `${pos.left}%`, top = `${pos.top}%`
        const lastSeen = emp.t ? new Date(emp.t).toLocaleTimeString() : new Date().toLocaleTimeString()
        return (
          <div key={emp.id} className="overlay-device" style={{ position:'absolute', left, top, zIndex:5, transform:'translate(-50%, -50%)' }}>
            <Mantine.Popover width={220} position="right" withArrow>
              <Mantine.Popover.Target>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer' }}>
                  <svg width="36" height="36" viewBox="0 0 36 36" style={{ display:'block' }}>
                    <circle cx="18" cy="18" r="16" fill="#ef4444" stroke="#ffffff" strokeWidth="3" />
                  </svg>
                  <div style={{ marginTop:4, fontSize:14, color:'#0b2540', lineHeight:1 }}>{deviceNames[emp.id]||emp.label||emp.id}</div>
                </div>
              </Mantine.Popover.Target>
              <Mantine.Popover.Dropdown>
                <Mantine.Text size="sm" weight={600}>{deviceNames[emp.id]||emp.label||emp.id}</Mantine.Text>
                <Mantine.Text size="xs" color="dimmed">Last seen: {lastSeen}</Mantine.Text>
                <Mantine.Button variant="outline" size="xs" mt="sm" onClick={()=> onCenter && onCenter(emp.id)}>Center</Mantine.Button>
              </Mantine.Popover.Dropdown>
            </Mantine.Popover>
          </div>
        )
      })}
    </>
  )
}
