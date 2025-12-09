import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export default function AnchorsCard({ anchors, setAnchors, factoryWidthMeters, setFactoryWidthMeters, factoryHeightMeters, setFactoryHeightMeters, deviceNames, onClearAnchors }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Anchors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Width (m)</Label>
            <Input type="number" value={factoryWidthMeters} onChange={(e) => setFactoryWidthMeters(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>Height (m)</Label>
            <Input type="number" value={factoryHeightMeters} onChange={(e) => setFactoryHeightMeters(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          {(anchors || []).map((a, idx) => (
            <li key={a.beaconId + idx}>
              <span className="font-semibold">{a.beaconId}</span> — x: {a.x.toFixed(3)}, y: {a.y.toFixed(3)}
              <Button variant="ghost" size="sm" className="ml-2 h-6 px-2" onClick={() => { const id = prompt('Edit beaconId', a.beaconId); if (!id) return; setAnchors(prev => prev.map((p, i) => i === idx ? { ...p, beaconId: id } : p)) }}>Edit</Button>
              <Button variant="secondary" size="sm" className="ml-1 h-6 px-2" onClick={() => setAnchors(prev => prev.filter((_, i) => i !== idx))}>Remove</Button>
            </li>
          ))}
        </ol>
        <div className="pt-2">
          <Button onClick={onClearAnchors} variant="destructive" size="sm">Clear Anchors</Button>
        </div>
      </CardContent>
    </Card>
  )
}
