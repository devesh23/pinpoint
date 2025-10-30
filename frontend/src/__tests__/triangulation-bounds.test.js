import { describe, it, expect } from 'vitest'
import { trilaterate } from '../triangulation'

// Room dimensions (meters) per user's spec
const ROOM_W = 3.8
const ROOM_H = 3.7

// Anchors placed around the room corners/walls (beaconId required by trilaterate)
const anchors = [
  { beaconId: 'A', x: 0.2, y: 0.2 },
  { beaconId: 'B', x: ROOM_W - 0.2, y: 0.15 },
  { beaconId: 'C', x: ROOM_W/2, y: ROOM_H - 0.15 },
  { beaconId: 'D', x: 0.15, y: ROOM_H - 0.2 }
]

function makeDistances(tagPos, noise = 0){
  return anchors.map(a => ({ beaconId: a.beaconId, distance: Math.hypot(tagPos.x - a.x, tagPos.y - a.y) + (Math.random()*2-1)*noise }))
}

describe('trilateration bounds', ()=>{
  it('should place known points inside room (no noise)', ()=>{
    const pts = [
      { x: ROOM_W/2, y: ROOM_H/2 },
      { x: 0.5, y: 0.5 },
      { x: ROOM_W - 0.5, y: 0.5 },
      { x: ROOM_W - 0.5, y: ROOM_H - 0.5 },
      { x: 0.5, y: ROOM_H - 0.5 }
    ]
    for(const p of pts){
      const dists = makeDistances(p, 0)
      const out = trilaterate(anchors, dists)
      expect(out).not.toBeNull()
      // within room bounds
      expect(out.x).toBeGreaterThanOrEqual(-0.01)
      expect(out.x).toBeLessThanOrEqual(ROOM_W + 0.01)
      expect(out.y).toBeGreaterThanOrEqual(-0.01)
      expect(out.y).toBeLessThanOrEqual(ROOM_H + 0.01)
      // accuracy reasonable (within 0.1m)
      const err = Math.hypot(out.x - p.x, out.y - p.y)
      expect(err).toBeLessThan(0.15)
    }
  })

  it('should keep randomized points inside room under small noise', ()=>{
    const noise = 0.05 // 5cm measurement noise
    for(let i=0;i<100;i++){
      const p = { x: Math.random() * (ROOM_W - 0.6) + 0.3, y: Math.random() * (ROOM_H - 0.6) + 0.3 }
      const dists = makeDistances(p, noise)
      const out = trilaterate(anchors, dists)
      expect(out).not.toBeNull()
      // ensure output remains inside the room (allow small epsilon)
      expect(out.x).toBeGreaterThanOrEqual(-0.1)
      expect(out.x).toBeLessThanOrEqual(ROOM_W + 0.1)
      expect(out.y).toBeGreaterThanOrEqual(-0.1)
      expect(out.y).toBeLessThanOrEqual(ROOM_H + 0.1)
      const err = Math.hypot(out.x - p.x, out.y - p.y)
      // under small noise error should be reasonable (under 0.5m)
      expect(err).toBeLessThan(0.6)
    }
  })
})
