import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

export default function Admin({ anchors, setAnchors, anchorNames, setAnchorNames, deviceNames, setDeviceNames, factoryWidthMeters, factoryHeightMeters, setFactoryWidthMeters, setFactoryHeightMeters, anchorHeight, setAnchorHeight, tagHeight, setTagHeight, onClose, apiKey, setApiKey, pollUrl, setPollUrl, useLive, setUseLive, smoothingMethod, setSmoothingMethod, connStatus, logs, fetchNow, clearLines, clearAllLines }) {
  const [localAnchors, setLocalAnchors] = useState(anchors)
  useEffect(() => setLocalAnchors(anchors), [anchors])

  function save() {
    setAnchors(localAnchors)
    onClose()
  }

  return (
    <div className="p-3 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Admin</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Factory Width (m)</Label>
          <Input type="number" value={factoryWidthMeters} onChange={(e) => setFactoryWidthMeters(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-2">
          <Label>Factory Height (m)</Label>
          <Input type="number" value={factoryHeightMeters} onChange={(e) => setFactoryHeightMeters(parseFloat(e.target.value) || 0)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Anchor Height (m)</Label>
          <Input type="number" step="0.1" value={anchorHeight} onChange={(e) => setAnchorHeight(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-2">
          <Label>Tag Height (m)</Label>
          <Input type="number" step="0.1" value={tagHeight} onChange={(e) => setTagHeight(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Connection & Stream</h3>
          <p className="text-sm text-muted-foreground">Configure API key, poll URL, streaming mode and smoothing.</p>
        </div>

        <div className="flex gap-4">
          <Input placeholder="API Key (optional)" value={apiKey || ''} onChange={e => setApiKey(e.target.value)} />
          <Input placeholder="Poll URL" value={pollUrl || ''} onChange={e => setPollUrl(e.target.value)} className="flex-1" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="use-live" checked={!!useLive} onCheckedChange={setUseLive} />
            <Label htmlFor="use-live">Use Live Stream</Label>
          </div>

          <Select value={smoothingMethod || 'ema'} onValueChange={setSmoothingMethod}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Smoothing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ema">EMA (fast)</SelectItem>
              <SelectItem value="kalman">Kalman (smooth)</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={fetchNow}>Fetch Now</Button>
          <Button variant="secondary" onClick={clearLines}>Clear Lines</Button>
          <Button variant="destructive" onClick={clearAllLines}>Clear All</Button>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={connStatus === 'open' ? 'default' : connStatus === 'connecting' ? 'secondary' : 'destructive'} className={connStatus === 'open' ? 'bg-green-500 hover:bg-green-600' : connStatus === 'connecting' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}>
            {connStatus}
          </Badge>
          <span className="text-sm">Connection status</span>
        </div>

        <div className="mt-2">
          <h3 className="text-sm font-semibold mb-2">Event Log</h3>
          <ScrollArea className="h-40 w-full rounded-md border bg-muted/50 p-2">
            {(!logs || logs.length === 0) ? (
              <span className="text-muted-foreground text-sm">No events yet</span>
            ) : (
              logs.slice().reverse().map((l, i) => (
                <div key={i} className="text-xs font-mono">{l}</div>
              ))
            )}
          </ScrollArea>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Anchor display names</h3>
          <p className="text-sm text-muted-foreground">Assign friendly names to anchors (beacon ids)</p>
        </div>
        <div className="space-y-2">
          {anchors.map(a => (
            <div key={a.beaconId} className="flex items-center gap-2">
              <span className="font-semibold min-w-[120px] text-sm">{a.beaconId}</span>
              <Input value={anchorNames[a.beaconId] || ''} onChange={e => setAnchorNames(prev => ({ ...prev, [a.beaconId]: e.target.value }))} className="flex-1" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Device display names</h3>
          <p className="text-sm text-muted-foreground">Assign friendly names to tracked devices when known.</p>
        </div>
        <div className="space-y-2">
          {Object.keys(deviceNames || {}).map(d => (
            <div key={d} className="flex items-center gap-2">
              <span className="font-semibold min-w-[120px] text-sm">{d}</span>
              <Input value={deviceNames[d] || ''} onChange={e => setDeviceNames(prev => ({ ...prev, [d]: e.target.value }))} className="flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
