import React from 'react'

/**
 * MiniMap
 * Bottom-right overview of anchors and recent device paths.
 * Props:
 * - paths: { [deviceId]: Array<{ x:number, y:number, t:number }> }
 * - anchors: Array<{ beaconId:string, x:number, y:number }>
 * - image: null | string | { type:'svg', width:number, height:number }
 * - svgViewBox: { x:number, y:number, w:number, h:number } | null
 */
export default function MiniMap({ paths, anchors, image, svgViewBox }){
  return (
    <div style={{ position:'absolute', right:16, bottom:16, zIndex:12, background:'rgba(255,255,255,0.9)', border:'1px solid rgba(0,0,0,0.06)', borderRadius:8, padding:6 }}>
      <svg width="160" height="120" viewBox="0 0 100 75">
        {/* path trails */}
        {Object.keys(paths||{}).map(deviceId => {
          const arr = paths[deviceId] || []
          if(arr.length < 2) return null
          const maxSeg = Math.min(arr.length-1, 120)
          const start = arr.length - 1 - maxSeg
          const segs = []
          for(let i=start;i<arr.length-1;i++){
            const a = arr[i], b = arr[i+1]
            const x1 = (a.x) * 100, y1 = (a.y) * 75
            const x2 = (b.x) * 100, y2 = (b.y) * 75
            const t = (i - start) / maxSeg
            const op = 0.15 + 0.75 * t
            segs.push(<line key={`m-${deviceId}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ef4444" strokeWidth="1.5" strokeOpacity={op} strokeLinecap="round" />)
          }
          return <g key={`mg-${deviceId}`}>{segs}</g>
        })}
        {/* anchors */}
        {(anchors||[]).map(a=> (
          <circle key={`ma-${a.beaconId}`} cx={(a.x*100)} cy={(a.y*75)} r="2.5" fill="#1d4ed8" />
        ))}
        {/* viewBox rect for inline SVGs */}
        {image && image.type==='svg' && svgViewBox && (
          (()=>{
            const nx = svgViewBox.x / (image.width||1)
            const ny = svgViewBox.y / (image.height||1)
            const nw = svgViewBox.w / (image.width||1)
            const nh = svgViewBox.h / (image.height||1)
            return <rect x={nx*100} y={ny*75} width={nw*100} height={nh*75} fill="none" stroke="#6b5e4a" strokeWidth="1" />
          })()
        )}
      </svg>
    </div>
  )
}
