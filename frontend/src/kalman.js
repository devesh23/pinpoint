// Minimal 2D Kalman Filter
// ------------------------
// Purpose: Smooth raw trilateration outputs subject to jitter/outliers.
// Model: Stationary (no velocity term). Each update treats measurement as direct observation.
// Tuning Parameters:
//   q (process noise)  : higher -> faster adaptation (less smoothing persistence)
//   r (measurement noise): higher -> stronger smoothing (trust prior state more)
// State: position only ({x,y}) with independent covariance terms.
// For more dynamic scenarios (e.g., moving worker with acceleration) extend to include velocity.

export class Kalman2D {
  constructor(q = 0.0001, r = 0.01) {
    // process noise q, measurement noise r
    this.q = q
    this.r = r
    // state: [x, y]
    this.x = null
    // covariance matrix 2x2
    this.P = [[1,0],[0,1]]
  }

  // Increase covariance (uncertainty) between measurements; no motion model applied.
  predict() {
    // no motion model (stationary model); only increase covariance
    this.P[0][0] += this.q
    this.P[1][1] += this.q
  }

  /**
   * Incorporate new measurement {x,y} and return filtered state.
   * Uses scalar adaptation per axis; avoids matrix inversions for speed.
   */
  update(z) {
    if(!this.x) {
      this.x = { x: z.x, y: z.y }
      // initialize covariance small
      this.P = [[0.01,0],[0,0.01]]
      return this.x
    }
    this.predict()
    // Kalman gain K = P * (P + R)^-1  where R = r*I
    const S00 = this.P[0][0] + this.r
    const S11 = this.P[1][1] + this.r
    const K00 = this.P[0][0] / S00
    const K11 = this.P[1][1] / S11

    // update state x = x + K*(z - x)
    this.x.x = this.x.x + K00 * (z.x - this.x.x)
    this.x.y = this.x.y + K11 * (z.y - this.x.y)

    // update covariance P = (I - K)P
    this.P[0][0] = (1 - K00) * this.P[0][0]
    this.P[1][1] = (1 - K11) * this.P[1][1]

    return this.x
  }
}

export default Kalman2D
