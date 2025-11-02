/**
 * triangulation.js
 * Implements a 2D non-linear trilateration solver used by the frontend to
 * convert per-router distance measurements into (x, y) positions in meters.
 *
 * The implementation uses an iterative Levenberg-Marquardt / Gauss-Newton
 * style update on the distance residuals. It is lightweight and suitable
 * for small numbers of anchors (3-6) typical for indoor UWB setups.
 *
 * Anchors: array of { beaconId, x, y } where x,y are in meters.
 * Distances: array of { beaconId, distance } where distance is in meters.
 */

function toMeasurements(anchors, distances){
  return distances
    .map(d => ({ ...d, anchor: anchors.find(a => a.beaconId === d.beaconId) }))
    .filter(m => m.anchor && Number.isFinite(m.distance) && m.distance >= 0);
}

/**
 * trilaterate
 * Solve for 2D position given anchors and distance measurements.
 * Returns { x, y } in meters or null when the system is degenerate.
 */
export function trilaterate(anchors, distances, opts = {}){
  // Simple linear least-squares 2D trilateration using the algebraic
  // formulation. This follows the approach of choosing the first anchor
  // as reference and solving A x = b in the least-squares sense.
  // Anchors: [{ beaconId, x, y }], distances: [{ beaconId, distance }]
  const { zeroIsAnchor = false } = opts
  const measurements = toMeasurements(anchors, distances);
  if(!measurements || measurements.length === 0) return null

  // if any measurement is exactly zero, return that anchor's position
  if(zeroIsAnchor){
    for(const m of measurements){ if(m.distance === 0) return { x: m.anchor.x, y: m.anchor.y } }
  }

  // need at least 3 measurements for a stable 2D solution
  if(measurements.length < 3){
    // fallback: if two measurements, return midpoint weighted by distances
    if(measurements.length === 2){
      const a = measurements[0].anchor, b = measurements[1].anchor
      const r0 = measurements[0].distance, r1 = measurements[1].distance
      const t = r0 / (r0 + r1)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    if(measurements.length === 1) return { x: measurements[0].anchor.x, y: measurements[0].anchor.y }
    return null
  }

  const ref = measurements[0].anchor
  const d0 = measurements[0].distance

  // Build normal equations ATA and ATb directly (2x2 system)
  let ATA00 = 0, ATA01 = 0, ATA11 = 0
  let ATb0 = 0, ATb1 = 0

  for(let i=1;i<measurements.length;i++){
    const ai = measurements[i]
    const xi = ai.anchor.x, yi = ai.anchor.y, di = ai.distance
    const a0 = 2*(xi - ref.x)
    const a1 = 2*(yi - ref.y)
  const bi = (xi*xi - ref.x*ref.x) + (yi*yi - ref.y*ref.y) + (d0*d0 - di*di)
    ATA00 += a0 * a0
    ATA01 += a0 * a1
    ATA11 += a1 * a1
    ATb0 += a0 * bi
    ATb1 += a1 * bi
  }

  // symmetric
  const ATA10 = ATA01

  const det = ATA00*ATA11 - ATA01*ATA10
  if(Math.abs(det) < 1e-12) return null

  const x = (ATb0*ATA11 - ATA01*ATb1) / det
  const y = (ATA00*ATb1 - ATb0*ATA10) / det
  return { x, y }
}

export default { trilaterate };
