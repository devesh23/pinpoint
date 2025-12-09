import React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { IconMapPin, IconEdit, IconTrash } from '@tabler/icons-react'

export default function PlanAnchorsOverlay({ anchors, anchorNames, normToPercent, onStartDrag, onEdit, onRemove }) {
  return (
    <TooltipProvider>
      {(anchors || []).map((a, idx) => {
        const pos = normToPercent(a.x, a.y)
        const left = `${pos.left}%`, top = `${pos.top}%`
        return (
          <div key={a.beaconId + idx} className="overlay-anchor absolute z-10 flex flex-col items-center" style={{ left, top }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white cursor-move" onMouseDown={(e) => onStartDrag && onStartDrag(idx, e)} aria-label="drag-anchor">
                  <IconMapPin size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{anchorNames[a.beaconId] || a.beaconId}</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex gap-1 mt-1 justify-center">
              <Button size="icon" variant="secondary" className="h-6 w-6" onClick={() => onEdit && onEdit(idx)} aria-label="edit-anchor">
                <IconEdit size={12} />
              </Button>
              <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => onRemove && onRemove(idx)} aria-label="remove-anchor">
                <IconTrash size={12} />
              </Button>
            </div>
          </div>
        )
      })}
    </TooltipProvider>
  )
}
