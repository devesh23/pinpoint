import { trilaterate } from './triangulation'

function approx(a,b,eps=1e-3){ return Math.abs(a-b) < eps }

// anchors form a triangle; true point at (4,2)
const anchors = [
  { beaconId:'a', x:0, y:0 },
  { beaconId:'b', x:10, y:0 },
  { beaconId:'c', x:0, y:10 }
]

// distances to (4,2)
const dx = (p)=>Math.hypot(p.x-4,p.y-2)
const distances = anchors.map(a=>({ beaconId: a.beaconId, distance: dx(a) }))

const result = trilaterate(anchors, distances)
console.log('trilat result', result)
if(!approx(result.x,4) || !approx(result.y,2)) throw new Error('Trilateration failed')
console.log('Trilateration test passed')
