import { it, expect } from 'vitest'
import { trilaterate } from '../triangulation'

// Reconstruct 2D (x,y) and estimate z from 3D distances that include a z offset.
it('recovers x,y from 3D distances (z known) and estimates z', ()=>{
  // Anchors with z=0
  const anchors = [
    { beaconId: '1', x: 0, y: 0 },
    { beaconId: '2', x: 5, y: 0 },
    { beaconId: '3', x: 0, y: 5 }
  ]

  // True 3D tag position (the user-provided expected)
  const truePos = { x: 1.9, y: 1.6, z: 2.1 }

  // compute 3D distances to anchors (in meters), then convert to cm as mock emits
  const distancesCm = anchors.map(a => {
    const dx = truePos.x - a.x
    const dy = truePos.y - a.y
    const dz = truePos.z
    const d = Math.hypot(dx, dy, dz)
    return { beaconId: a.beaconId, distance: Math.round(d * 100) }
  })

  // Emulate frontend conversion cm->m
  const distancesMeters = distancesCm.map(d => ({ beaconId: d.beaconId, distance: d.distance / 100 }))

  // To use the 2D trilaterator we must remove the vertical component:
  // horizontal = sqrt(d^2 - z^2)
  const horDistances = distancesMeters.map(d => ({
    beaconId: d.beaconId,
    distance: Math.sqrt(Math.max(0, d.distance*d.distance - truePos.z*truePos.z))
  }))

  const out = trilaterate(anchors, horDistances)
  expect(out).not.toBeNull()
  expect(Math.abs(out.x - truePos.x)).toBeLessThan(0.1)
  expect(Math.abs(out.y - truePos.y)).toBeLessThan(0.1)

  // estimate z from each anchor using the computed (x,y): z = sqrt(d^2 - horiz^2)
  const zEstimates = distancesMeters.map(d => {
    const a = anchors.find(a=>a.beaconId===d.beaconId)
    const horiz = Math.hypot(out.x - a.x, out.y - a.y)
    const z = Math.sqrt(Math.max(0, d.distance*d.distance - horiz*horiz))
    return z
  })
  const zAvg = zEstimates.reduce((s,v)=>s+v,0)/zEstimates.length
  expect(Math.abs(zAvg - truePos.z)).toBeLessThan(0.15)
})
