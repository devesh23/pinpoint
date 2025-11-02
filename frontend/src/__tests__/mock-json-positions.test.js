import { it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { trilaterate } from '../triangulation'

// The mock.json was captured in a real room sized: width=3.8m, height=3.7m.
// The frontend stores anchors as normalized coords (0..1). We don't know which
// beaconId corresponds to which normalized corner. Try all permutations of the
// three corners and pick the mapping that yields the fewest out-of-bounds
// trilateration results.
const ROOM_W = 3.8
const ROOM_H = 3.7

// normalized anchor corner positions (nx, ny). Anchors were placed in corners
// but we don't know which corners. Consider all four corners and try every
// selection of three corners (4 choose 3 = 4) and all permutations of beacon
// assignments for each selection.
const normalizedCorners = [
  { nx: 0.0, ny: 0.0 },
  { nx: 0.0, ny: 1.0 },
  { nx: 1.0, ny: 0.0 },
  { nx: 1.0, ny: 1.0 }
]

function permutations(arr){
  if(arr.length <= 1) return [arr.slice()]
  const res = []
  for(let i=0;i<arr.length;i++){
    const el = arr[i]
    const rest = arr.slice(0,i).concat(arr.slice(i+1))
    for(const p of permutations(rest)) res.push([el].concat(p))
  }
  return res
}

function combinations(arr, k){
  const res = []
  function helper(start, combo){
    if(combo.length === k){ res.push(combo.slice()); return }
    for(let i = start; i < arr.length; i++){
      combo.push(arr[i])
      helper(i+1, combo)
      combo.pop()
    }
  }
  helper(0, [])
  return res
}

function extractJsonObjects(text){
  const objs = []
  for(let i=0;i<text.length;i++){
    if(text[i] !== '{') continue
    let depth = 0
    let j = i
    for(; j < text.length; j++){
      if(text[j] === '{') depth++
      else if(text[j] === '}') depth--
      if(depth === 0) break
    }
    if(depth === 0){
      const chunk = text.slice(i, j+1)
      try{ const o = JSON.parse(chunk); objs.push(o) }catch(e){}
      i = j
    }
  }
  return objs
}

it('solves stream updates and stays within room (handles varying Z)', ()=>{
  const mockPath = path.resolve(process.cwd(), '..', 'mock.json')
  const txt = fs.readFileSync(mockPath, 'utf8')
  const objs = extractJsonObjects(txt)
  const updatesWithAnchors = objs.filter(o => o && (o.anchorsInMeters && o.distancesM))

  if(updatesWithAnchors.length > 0){
    // Preferred path: entries provide anchors and distances in meters
    let withinBounds = 0
    let withTruthOK = 0
    const tol = 0.25 // 25 cm tolerance to reported posMeters when available
    for(const u of updatesWithAnchors){
      const anchors = u.anchorsInMeters.map(a => ({ beaconId: a.beaconId, x: a.x, y: a.y }))
      const distances = u.distancesM.map(d => ({ beaconId: d.beaconId, distance: Number(d.distance) }))
      const out = trilaterate(anchors, distances)
      expect(out).not.toBeNull()
      expect(out.x).toBeGreaterThanOrEqual(-0.05)
      expect(out.x).toBeLessThanOrEqual(ROOM_W + 0.05)
      expect(out.y).toBeGreaterThanOrEqual(-0.05)
      expect(out.y).toBeLessThanOrEqual(ROOM_H + 0.05)
      withinBounds++
      if(u.posMeters && Number.isFinite(u.posMeters.x) && Number.isFinite(u.posMeters.y)){
        const err = Math.hypot(out.x - u.posMeters.x, out.y - u.posMeters.y)
        expect(err).toBeLessThan(tol)
        withTruthOK++
      }
    }
    expect(withinBounds).toBe(updatesWithAnchors.length)
    expect(withTruthOK).toBeGreaterThan(0)
    return
  }

  // Fallback path: no explicit anchors in the dataset. Assume anchors are at
  // the room corners and search mappings that minimize out-of-bounds results.
  const updates = objs
    .map(o => o && (o.payload || o))
    .filter(p => p && Array.isArray(p.beacons))
    .filter(p => p.beacons.length >= 3)

  expect(updates.length).toBeGreaterThan(0)

  // Collect unique beaconIds seen in the stream (expect 3)
  const beaconIdSet = new Set()
  for(const p of updates){
    for(const b of p.beacons) beaconIdSet.add(b.beaconId)
  }
  const beaconIds = Array.from(beaconIdSet).slice(0,3)
  expect(beaconIds.length).toBe(3)

  const cornerCombos = combinations(normalizedCorners, 3)
  let best = { failures: Infinity, mapping: null, considered: 0 }
  const epsilon = 0.1 // 10 cm bounds epsilon

  for(const combo of cornerCombos){
    for(const perm of permutations(combo)){
      const anchors = beaconIds.map((bid, i) => ({ beaconId: bid, x: perm[i].nx * ROOM_W, y: perm[i].ny * ROOM_H }))
      let failures = 0
      let considered = 0
      for(const p of updates){
        const dists = p.beacons.map(b => ({ beaconId: b.beaconId, distance: Number(b.distance) / 100 }))
        const out = trilaterate(anchors, dists, { zeroIsAnchor: true, zeroEpsilon: 0.15 })
        if(!out){ failures++; continue }
        if(out.x < -epsilon || out.x > ROOM_W + epsilon || out.y < -epsilon || out.y > ROOM_H + epsilon){
          failures++
        }
        considered++
      }
      if(considered > 0){
        if(failures < best.failures){ best = { failures, mapping: anchors, considered } }
      }
    }
  }

  // Allow small fraction of outliers due to measurement noise and modeling assumptions
  const failRate = best.failures / Math.max(1, best.considered)
  expect(failRate).toBeLessThan(0.20)
})
