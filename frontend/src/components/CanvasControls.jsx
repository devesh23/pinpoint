import React from 'react'
import * as Mantine from '@mantine/core'

/**
 * CanvasControls
 * Top-right overlay controls for zoom in/out and reset, plus zoom percent.
 * Props:
 * - image: current plan image object (string or { type:'svg', width, height })
 * - svgViewBox: current viewBox ({ x, y, w, h }) or null
 * - onZoomIn: () => void
 * - onZoomOut: () => void
 * - onReset: () => void
 * - zoomPercentText: string to display (e.g., "125%")
 */
export default function CanvasControls({ image, svgViewBox, onZoomIn, onZoomOut, onReset, zoomPercentText }){
  return (
    <div style={{ position:'absolute', right:12, top:12, zIndex:20, display:'flex', gap:8 }}>
      <Mantine.Button size="xs" variant="filled" onClick={onZoomIn} title="Zoom In">＋</Mantine.Button>
      <Mantine.Button size="xs" variant="filled" onClick={onZoomOut} title="Zoom Out">－</Mantine.Button>
      <Mantine.Button size="xs" variant="light" onClick={onReset} title="Reset view">⟲</Mantine.Button>
      <div style={{ alignSelf:'center', padding:'2px 8px', fontSize:12, color:'#6b5e4a', background:'rgba(255,255,255,0.9)', border:'1px solid rgba(0,0,0,0.06)', borderRadius:6 }}>
        {zoomPercentText}
      </div>
    </div>
  )
}
