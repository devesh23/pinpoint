import React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

export default function DevicesOverlay({ employees, deviceNames, normToPercent, onCenter }) {
  return (
    <>
      {(employees || []).map(emp => {
        const pos = normToPercent(emp.x, emp.y)
        const left = `${pos.left}%`, top = `${pos.top}%`
        const lastSeen = emp.t ? new Date(emp.t).toLocaleTimeString() : new Date().toLocaleTimeString()
        return (
          <div key={emp.id} className="overlay-device absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex flex-col items-center cursor-pointer">
                  <svg width="36" height="36" viewBox="0 0 36 36" className="block drop-shadow-md">
                    <circle cx="18" cy="18" r="16" fill="#ef4444" stroke="#ffffff" strokeWidth="3" />
                  </svg>
                  <div className="mt-1 text-xs font-semibold text-white drop-shadow-md">{deviceNames[emp.id] || emp.label || emp.id}</div>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-56">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">{deviceNames[emp.id] || emp.label || emp.id}</h4>
                  <p className="text-sm text-muted-foreground">Last seen: {lastSeen}</p>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => onCenter && onCenter(emp.id)}>Center</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )
      })}
    </>
  )
}
