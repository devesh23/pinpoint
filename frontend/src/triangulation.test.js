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
  const res = trilaterate(anchors, distances, { zeroIsAnchor: true })
    expect(res).toBeTruthy()
    expect(Math.abs(res.x - truePos.x)).toBeLessThan(0.15)
    expect(Math.abs(res.y - truePos.y)).toBeLessThan(0.15)
  })

  it('handles zero-distance (tag on anchor) and returns anchor position', () => {
    const factory = 1.6
    const anchorsNorm = [
      { beaconId: '020000b3', x: 0.015, y: 0.062 },
      { beaconId: '02000053', x: 0.016, y: 1.0 },
      { beaconId: '020000e6', x: 0.988, y: 1.0 }
    ]
    const anchors = anchorsNorm.map(a => ({ beaconId: a.beaconId, x: a.x * factory, y: a.y * factory }))
    // distances are reported in centimeters in the live stream; convert to meters
    const distances = [
      { beaconId: '02000053', distance: 189 / 100 },
      { beaconId: '020000e6', distance: 227 / 100 },
      { beaconId: '020000b3', distance: 0 }
    ]

      const res = trilaterate(anchors, distances, { zeroIsAnchor: true })
      // debug output to help diagnose CI/vitest vs node differences
      // console.log({ anchors, distances, res })
    expect(res).toBeTruthy()
    // Expect result to be very close to the b3 anchor (within 1 cm)
    const b3 = anchors.find(a => a.beaconId === '020000b3')
      // eslint-disable-next-line no-console
      console.log('test-debug', { b3, res })
    expect(Math.abs(res.x - b3.x)).toBeLessThan(0.01)
    expect(Math.abs(res.y - b3.y)).toBeLessThan(0.01)
  })

  it('reproduces reported live-stream case and has small residuals', () => {
    const factory = 1.6
    const anchorsNorm = [
      { beaconId: '020000b3', x: 0.015, y: 0.062 },
      { beaconId: '02000053', x: 0.016, y: 1.0 },
      { beaconId: '020000e6', x: 0.988, y: 1.0 }
    ]
    const anchors = anchorsNorm.map(a => ({ beaconId: a.beaconId, x: a.x * factory, y: a.y * factory }))

    // stream distances (cm -> m)
    const distances = [
      { beaconId: '02000053', distance: 85 / 100 },
      { beaconId: '020000b3', distance: 83 / 100 },
      { beaconId: '020000e6', distance: 155 / 100 }
    ]

    const res = trilaterate(anchors, distances)
    expect(res).toBeTruthy()

    // compute residuals to each anchor (meters)
    const residuals = distances.map(d => {
      const a = anchors.find(x => x.beaconId === d.beaconId)
      const est = Math.hypot(res.x - a.x, res.y - a.y)
      return Math.abs(est - d.distance)
    })

    // All residuals should be reasonably small (<= 0.20 m)
    for(const r of residuals) expect(r).toBeLessThan(0.20)

    // Normalized x should be within room (0..1)
    const nx = res.x / factory
    const ny = res.y / factory
    expect(nx).toBeGreaterThanOrEqual(0)
    expect(nx).toBeLessThanOrEqual(1)
    expect(ny).toBeGreaterThanOrEqual(0)
    expect(ny).toBeLessThanOrEqual(1)
  })
})
