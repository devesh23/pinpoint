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

it('all positions computed from mock.json are inside the room bounds', ()=>{
  const mockPath = path.resolve(process.cwd(), '..', 'mock.json')
  const txt = fs.readFileSync(mockPath, 'utf8')
  const objs = extractJsonObjects(txt)
  const updates = objs.filter(o => (o && (o.type === 'uwb_update' || (o.payload && o.payload.beacons))))
  expect(updates.length).toBeGreaterThan(0)

  // Collect unique beaconIds seen in the stream (we expect 3)
  const beaconIdSet = new Set()
  for(const u of updates){
    const payload = u.payload || u
    if(!payload || !Array.isArray(payload.beacons)) continue
    for(const b of payload.beacons) beaconIdSet.add(b.beaconId)
  }
  const beaconIds = Array.from(beaconIdSet)
  if(beaconIds.length < 3) throw new Error('expected at least 3 beaconIds in mock.json')

  // Try all combinations of 3 corners out of the 4 candidate corners, then
  // try all permutations of beacon assignments for each combination.
  const cornerCombos = combinations(normalizedCorners, 3)
  let best = { failures: Infinity, mapping: null, sample: null }

  for(const combo of cornerCombos){
    const perms = permutations(combo)
    for(const perm of perms){
      // build anchors for this mapping: assign perm[i] -> beaconIds[i]
      const anchors = beaconIds.slice(0,3).map((bid, i) => ({ beaconId: bid, x: perm[i].nx * ROOM_W, y: perm[i].ny * ROOM_H }))
      const failures = []

      for(const u of updates){
        const payload = u.payload || u
        if(!payload || !Array.isArray(payload.beacons)) continue
        const dists = payload.beacons.map(b => ({ beaconId: b.beaconId, distance: Number(b.distance) / 100 }))
        const out = trilaterate(anchors, dists)
        if(!out){ failures.push({ reason: 'null-result', payload }) ; continue }
        const eps = 0.01
        if(out.x < -eps || out.x > ROOM_W + eps || out.y < -eps || out.y > ROOM_H + eps){
          failures.push({ reason: 'out-of-bounds', out, payload })
        }
      }

      if(failures.length < best.failures){
        best.failures = failures.length
        best.mapping = anchors
        best.sample = failures.slice(0,3)
      }
    }
  }

  if(best.failures > 0){
    const mappingInfo = best.mapping.map(a => ({ beaconId: a.beaconId, x: a.x, y: a.y }))
    const sample = JSON.stringify(best.sample, null, 2)
    throw new Error(`No perfect mapping found. Best mapping produced ${best.failures} failures. Mapping sample:\n${JSON.stringify(mappingInfo, null, 2)}\nFailures sample:\n${sample}`)
  }
})
