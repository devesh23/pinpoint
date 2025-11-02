import React from 'react'
import * as Mantine from '@mantine/core'

/**
 * AnchorsCard
 * Renders width/height inputs and a list of anchors with edit/remove actions.
 * Props:
 * - anchors, setAnchors
 * - factoryWidthMeters, setFactoryWidthMeters
 * - factoryHeightMeters, setFactoryHeightMeters
 * - deviceNames
 * - onClearAnchors: () => void
 */
export default function AnchorsCard({ anchors, setAnchors, factoryWidthMeters, setFactoryWidthMeters, factoryHeightMeters, setFactoryHeightMeters, deviceNames, onClearAnchors }){
  return (
    <Mantine.Card radius="md" p="md">
      <Mantine.Group position="apart"><Mantine.Text weight={600}>Anchors</Mantine.Text></Mantine.Group>
      <Mantine.Group mt="sm">
        <Mantine.NumberInput label="Width (m)" value={factoryWidthMeters} onChange={(v)=>setFactoryWidthMeters(v||0)} />
        <Mantine.NumberInput label="Height (m)" value={factoryHeightMeters} onChange={(v)=>setFactoryHeightMeters(v||0)} />
      </Mantine.Group>
      <ol style={{ marginTop: 12 }}>
        {(anchors||[]).map((a,idx)=> (
          <li key={a.beaconId+idx} style={{ marginBottom:6 }}>
            <strong>{a.beaconId}</strong> — x: {a.x.toFixed(3)}, y: {a.y.toFixed(3)}
            <Mantine.Button variant="subtle" size="xs" style={{ marginLeft:8 }} onClick={()=>{ const id = prompt('Edit beaconId', a.beaconId); if(!id) return; setAnchors(prev=> prev.map((p,i)=> i===idx? {...p, beaconId: id } : p)) }}>Edit</Mantine.Button>
            <Mantine.Button variant="light" size="xs" style={{ marginLeft:6 }} onClick={()=> setAnchors(prev=> prev.filter((_,i)=> i!==idx)) }>Remove</Mantine.Button>
          </li>
        ))}
      </ol>
      <Mantine.Group mt="sm">
        <Mantine.Button onClick={onClearAnchors}>Clear Anchors</Mantine.Button>
      </Mantine.Group>
    </Mantine.Card>
  )
}
