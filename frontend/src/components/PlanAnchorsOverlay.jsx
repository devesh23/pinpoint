import React from 'react'
import * as Mantine from '@mantine/core'
import { IconMapPin, IconEdit, IconTrash } from '@tabler/icons-react'

/**
 * PlanAnchorsOverlay
 * Renders draggable anchor pins and edit/remove actions on raster images.
 * Props:
 * - anchors: Array<{ beaconId, x, y }>
 * - anchorNames: Record<string,string>
 * - normToPercent: (nx, ny) => { left, top }
 * - onStartDrag: (index:number, event:MouseEvent) => void
 * - onEdit: (index:number) => void
 * - onRemove: (index:number) => void
 */
export default function PlanAnchorsOverlay({ anchors, anchorNames, normToPercent, onStartDrag, onEdit, onRemove }){
  return (
    <>
      {(anchors||[]).map((a, idx)=> {
        const pos = normToPercent(a.x, a.y)
        const left = `${pos.left}%`, top = `${pos.top}%`
        return (
          <div key={a.beaconId + idx} className="overlay-anchor" style={{ position:'absolute', left, top, zIndex:4 }}>
            <Mantine.Tooltip label={anchorNames[a.beaconId] || a.beaconId} withArrow position="right">
              <Mantine.ActionIcon size="lg" variant="filled" color="blue" onMouseDown={(e)=> onStartDrag && onStartDrag(idx, e)} aria-label="drag-anchor">
                <IconMapPin size={18} />
              </Mantine.ActionIcon>
            </Mantine.Tooltip>
            <Mantine.Group spacing={6} style={{ marginTop:6, justifyContent:'center' }}>
              <Mantine.ActionIcon size="xs" variant="light" onClick={()=> onEdit && onEdit(idx)} aria-label="edit-anchor">
                <IconEdit size={14} />
              </Mantine.ActionIcon>
              <Mantine.ActionIcon size="xs" color="red" variant="light" onClick={()=> onRemove && onRemove(idx)} aria-label="remove-anchor">
                <IconTrash size={14} />
              </Mantine.ActionIcon>
            </Mantine.Group>
          </div>
        )
      })}
    </>
  )
}
