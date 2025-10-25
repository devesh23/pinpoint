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
    .filter(m => m.anchor && m.distance > 0);
}

/**
 * trilaterate
 * Solve for 2D position given anchors and distance measurements.
 * Returns { x, y } in meters or null when the system is degenerate.
 */
export function trilaterate(anchors, distances){
  const measurements = toMeasurements(anchors, distances);
  if(measurements.length === 0) return null;
  if(measurements.length === 1) return { x: measurements[0].anchor.x, y: measurements[0].anchor.y };

  // initial guess: centroid of anchors weighted by 1/distance
  let x = 0, y = 0, wsum = 0;
  for(const m of measurements){
    const w = 1 / Math.max(0.001, m.distance);
    x += m.anchor.x * w; y += m.anchor.y * w; wsum += w;
  }
  x /= wsum; y /= wsum;

  const maxIter = 30;
  const lambda0 = 1e-3;

  for(let iter=0; iter<maxIter; iter++){
    const JtJ = [[0,0],[0,0]];
    const Jtr = [0,0];
    let cost = 0;

    for(const m of measurements){
      const dx = x - m.anchor.x;
      const dy = y - m.anchor.y;
      const distEst = Math.hypot(dx, dy);
      const ri = m.distance;
      const r = distEst - ri;
      cost += r*r;
      // avoid division by zero
      const inv = distEst > 1e-6 ? 1.0/distEst : 0.0;
      const Ji = [ dx * inv, dy * inv ]; // partial derivatives of distEst wrt x,y
      // accumulate J^T J and J^T r
      JtJ[0][0] += Ji[0]*Ji[0];
      JtJ[0][1] += Ji[0]*Ji[1];
      JtJ[1][0] += Ji[1]*Ji[0];
      JtJ[1][1] += Ji[1]*Ji[1];
      Jtr[0] += Ji[0]*r;
      Jtr[1] += Ji[1]*r;
    }

    // Levenberg-Marquardt: (JtJ + lambda*I) delta = -Jtr
    const lambda = lambda0 * (iter+1);
    const A00 = JtJ[0][0] + lambda;
    const A01 = JtJ[0][1];
    const A10 = JtJ[1][0];
    const A11 = JtJ[1][1] + lambda;
    const b0 = -Jtr[0];
    const b1 = -Jtr[1];

    const det = A00*A11 - A01*A10;
    if(Math.abs(det) < 1e-12) break;
    const dx = (b0*A11 - b1*A01) / det;
    const dy = (A00*b1 - A10*b0) / det;

    x += dx; y += dy;

    if(Math.hypot(dx,dy) < 1e-4) break;
  }

  return { x, y };
}

export default { trilaterate };
