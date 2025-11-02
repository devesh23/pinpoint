import { describe, it, expect } from 'vitest'
import { trilaterate } from '../triangulation'

// Validate that with anchors at the same height (z=0) and a tag at a large constant Z,
// the solver can recover (x,y) directly from true 3D distances without removing z.

describe('trilaterate with 3D distances and constant Z (anchors share height)', () => {
  const S = 10 // square size (meters)
  const Z = 1.5 // tag height in meters

  const anchors4 = [
    { beaconId: 'A', x: 0, y: 0 },
    { beaconId: 'B', x: S, y: 0 },
    { beaconId: 'C', x: S, y: S },
    { beaconId: 'D', x: 0, y: S }
  ]

  const anchors3 = [
    { beaconId: 'A', x: 0, y: 0 },
    { beaconId: 'B', x: S, y: 0 },
    { beaconId: 'C', x: 0, y: S }
  ]

  function dists3D(anchors, p){
    return anchors.map(a => ({
      beaconId: a.beaconId,
      distance: Math.hypot(p.x - a.x, p.y - a.y, Z)
    }))
  }

  it('recovers XY from 3D distances with four anchors', () => {
    const points = [
      { x: S*0.5, y: S*0.5 },
      { x: S*0.3, y: S*0.6 },
      { x: S*0.7, y: S*0.4 },
      { x: S*0.4, y: S*0.7 },
      { x: S*0.6, y: S*0.6 }
    ]
    const tol = 1e-2 // 1 cm tolerance
    for(const p of points){
      const distances = dists3D(anchors4, p)
      const out = trilaterate(anchors4, distances)
      expect(out).not.toBeNull()
      expect(Math.abs(out.x - p.x)).toBeLessThan(tol)
      expect(Math.abs(out.y - p.y)).toBeLessThan(tol)
    }
  })

  it('recovers XY from 3D distances with three anchors', () => {
    const points = [
      { x: S*0.55, y: S*0.45 },
      { x: S*0.25, y: S*0.35 },
      { x: S*0.65, y: S*0.65 }
    ]
    const tol = 1e-2
    for(const p of points){
      const distances = dists3D(anchors3, p)
      const out = trilaterate(anchors3, distances)
      expect(out).not.toBeNull()
      expect(Math.abs(out.x - p.x)).toBeLessThan(tol)
      expect(Math.abs(out.y - p.y)).toBeLessThan(tol)
    }
  })
})
