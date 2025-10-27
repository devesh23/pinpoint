import { describe, it, expect } from 'vitest'
import { trilaterate } from './triangulation'

describe('triangulation (legacy script converted)', () => {
  it('computes expected location for a simple triangle', () => {
    const anchors = [
      { beaconId:'a', x:0, y:0 },
      { beaconId:'b', x:10, y:0 },
      { beaconId:'c', x:0, y:10 }
    ]
    const truePos = { x: 4, y: 2 }
    const distances = anchors.map(a => ({ beaconId: a.beaconId, distance: Math.hypot(truePos.x - a.x, truePos.y - a.y) }))
    const res = trilaterate(anchors, distances)
    expect(res).toBeTruthy()
    expect(Math.abs(res.x - truePos.x)).toBeLessThan(0.15)
    expect(Math.abs(res.y - truePos.y)).toBeLessThan(0.15)
  })
})
