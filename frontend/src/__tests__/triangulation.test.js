import { describe, it, expect } from 'vitest'
import { trilaterate } from '../triangulation'

describe('trilaterate', () => {
  it('recovers a known position from three anchors', () => {
    // anchors in meters
    const anchors = [
      { beaconId: 'a1', x: 0, y: 0 },
      { beaconId: 'a2', x: 10, y: 0 },
      { beaconId: 'a3', x: 0, y: 10 }
    ]
    const truePos = { x: 3, y: 4 }
    const distances = anchors.map(a => ({ beaconId: a.beaconId, distance: Math.hypot(truePos.x - a.x, truePos.y - a.y) }))
    const res = trilaterate(anchors, distances)
    expect(res).toBeTruthy()
    expect(Math.abs(res.x - truePos.x)).toBeLessThan(0.15)
    expect(Math.abs(res.y - truePos.y)).toBeLessThan(0.15)
  })

  it('returns null when no measurements', () => {
    const r = trilaterate([], [])
    expect(r).toBeNull()
  })
})
