import React from 'react'
import { Button } from "@/components/ui/button"
import { Plus, Minus, RotateCcw } from "lucide-react"

export default function CanvasControls({ image, svgViewBox, onZoomIn, onZoomOut, onReset, zoomPercentText }) {
  return (
    <div className="absolute right-3 top-3 z-20 flex gap-2">
      <Button size="sm" onClick={onZoomIn} title="Zoom In" className="h-8 w-8 p-0"><Plus className="h-4 w-4" /></Button>
      <Button size="sm" onClick={onZoomOut} title="Zoom Out" className="h-8 w-8 p-0"><Minus className="h-4 w-4" /></Button>
      <Button size="sm" variant="secondary" onClick={onReset} title="Reset view" className="h-8 w-8 p-0"><RotateCcw className="h-4 w-4" /></Button>
      <div className="self-center px-2 py-0.5 text-xs text-muted-foreground bg-background/90 border rounded-md">
        {zoomPercentText}
      </div>
    </div>
  )
}
