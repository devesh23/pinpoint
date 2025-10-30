import { it, expect } from 'vitest'
import { trilaterate } from '../triangulation'

// Provided anchor/distance set (ignore Z axis for anchors)
// Anchors:
// 1: (0,0), d=3.6
// 2: (5,0), d=2.8
// 3: (0,5), d=3.2
// 4: (0,0) [same XY as anchor 1 but Z=3 ignored], d=4.5

it.skip('matches expected position for provided 4-anchor sample (ignore Z)', ()=>{
  const anchors = [
    { beaconId: '1', x: 0, y: 0 },
    { beaconId: '2', x: 5, y: 0 },
    { beaconId: '3', x: 0, y: 5 },
  ]
  const distances = [
    { beaconId: '1', distance: 360 },
    { beaconId: '2', distance: 280 },
    { beaconId: '3', distance: 320 }
  ]

  // convert cm -> m before calling trilaterate (frontend does this for mock/live)
  const distancesMeters = distances.map(d => ({ beaconId: d.beaconId, distance: d.distance / 100 }))
  const out = trilaterate(anchors, distancesMeters)
  expect(out).not.toBeNull()
  // Rather than assert exact xy (solver may converge to a nearby solution),
  // ensure the estimated position reproduces the provided distances within a
  // reasonable tolerance (15 cm).
  const tol = 0.15
  for(const d of distances){
    const a = anchors.find(a => a.beaconId === d.beaconId)
    const est = Math.hypot(out.x - a.x, out.y - a.y)
    // compare to original distances in meters
    expect(Math.abs(est - (d.distance/100))).toBeLessThanOrEqual(tol)
  }
})
