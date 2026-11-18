/**
 * LiveScan Mobile Forensic - AFIS 1:1 Matcher & Neon Laser Engine
 * Performs 1:1 forensic verification between Probe and Reference fingerprints:
 * - Deterministic minutiae point pattern alignment (translation & rotation invariant)
 * - Strict topological matching with Euclidean & Angular tolerance
 * - Standard forensic threshold (12 homologous points for positive identity)
 * - Interactive Neon Laser scanning beam animation
 * - Forensic laser vectors linking matched minutiae across dual viewports
 */

export class AFISMatcher {
  constructor() {
    this.distThreshold = 13;       // Strict spatial tolerance in pixels (standard 500 DPI scale)
    this.angleThreshold = 0.42;     // Angular tolerance (~24 degrees)
    this.minMatchThreshold = 12;    // International & Chilean forensic standard (12 puntos característicos)
  }

  /**
   * Match Probe minutiae list against Reference minutiae list
   */
  match(probeMinutiae, refMinutiae) {
    if (!probeMinutiae || !refMinutiae || probeMinutiae.length < 5 || refMinutiae.length < 5) {
      return {
        isMatch: false,
        score: 0,
        percentage: 0,
        matchedPairs: [],
        probeCount: probeMinutiae ? probeMinutiae.length : 0,
        refCount: refMinutiae ? refMinutiae.length : 0,
        verdict: 'DATOS INSUFICIENTES (MÍNIMO 5 MINUCIAS)',
        rotation: 0,
        translation: { dx: 0, dy: 0 }
      };
    }

    let bestScore = 0;
    let bestPairs = [];
    let bestTransform = { dx: 0, dy: 0, angle: 0 };

    // Select high-quality candidate pairs to hypothesize alignment transformations
    const maxProbeSamples = Math.min(30, probeMinutiae.length);
    const maxRefSamples = Math.min(30, refMinutiae.length);

    for (let i = 0; i < maxProbeSamples; i++) {
      const p = probeMinutiae[i];

      for (let j = 0; j < maxRefSamples; j++) {
        const r = refMinutiae[j];

        // Strict morphological type compatibility (bifurcation with bifurcation, termination with termination)
        if (p.type !== r.type) continue;

        let dAngle = r.angle - p.angle;
        while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
        while (dAngle < -Math.PI) dAngle += 2 * Math.PI;

        // In hand-held touchless / livescan, rotational tilt is rarely > 65 degrees
        if (Math.abs(dAngle) > 1.15) continue;

        const cosA = Math.cos(dAngle);
        const sinA = Math.sin(dAngle);

        // Compute translation under this pair hypothesis
        const dx = r.x - (p.x * cosA - p.y * sinA);
        const dy = r.y - (p.x * sinA + p.y * cosA);

        // Count inlier matches under this hypothesis
        const matched = [];
        const usedRef = new Set();

        for (let pi = 0; pi < probeMinutiae.length; pi++) {
          const pm = probeMinutiae[pi];
          // Transform probe point into reference coordinate frame
          const tx = pm.x * cosA - pm.y * sinA + dx;
          const ty = pm.x * sinA + pm.y * cosA + dy;
          let ta = pm.angle + dAngle;
          while (ta > Math.PI) ta -= 2 * Math.PI;
          while (ta < -Math.PI) ta += 2 * Math.PI;

          let closestRef = -1;
          let minDistSq = this.distThreshold * this.distThreshold;

          for (let ri = 0; ri < refMinutiae.length; ri++) {
            if (usedRef.has(ri)) continue;
            const rm = refMinutiae[ri];

            // Only match identical minutiae type
            if (pm.type !== rm.type) continue;

            const ex = tx - rm.x;
            const ey = ty - rm.y;
            const distSq = ex * ex + ey * ey;

            if (distSq < minDistSq) {
              // Angular difference check
              let adiff = Math.abs(ta - rm.angle);
              if (adiff > Math.PI) adiff = 2 * Math.PI - adiff;

              if (adiff <= this.angleThreshold) {
                minDistSq = distSq;
                closestRef = ri;
              }
            }
          }

          if (closestRef !== -1) {
            usedRef.add(closestRef);
            matched.push({
              probe: pm,
              reference: refMinutiae[closestRef],
              distance: Math.sqrt(minDistSq)
            });
          }
        }

        if (matched.length > bestScore) {
          bestScore = matched.length;
          bestPairs = matched;
          bestTransform = { dx, dy, angle: dAngle };
        }
      }
    }

    // Forensic Percentage & Verdict Calculation
    // Forensic standard: Requires 12 or more homologous minutiae for certainty
    const minPoints = Math.min(probeMinutiae.length, refMinutiae.length);
    const targetPoints = Math.max(12, Math.min(20, minPoints * 0.6));

    let percentage = 0;
    if (bestScore >= this.minMatchThreshold) {
      // 12 or more points: 75% to 100%
      percentage = Math.min(100, Math.round(75 + ((bestScore - 12) / Math.max(1, targetPoints - 12)) * 25));
    } else if (bestScore >= 8) {
      // 8 to 11 points: 45% to 68% (inconclusive / dubious)
      percentage = Math.round(45 + ((bestScore - 8) / 4) * 23);
    } else {
      // 0 to 7 points: 0% to 35% (negative)
      percentage = Math.round((bestScore / 8) * 35);
    }

    const isMatch = bestScore >= this.minMatchThreshold;
    let verdict = 'NO COINCIDE (NEGATIVO)';

    if (bestScore >= 16) {
      verdict = 'COINCIDENCIA PLENA (IDENTIDAD CONFIRMADA)';
    } else if (bestScore >= 12) {
      verdict = 'COINCIDENCIA POSITIVA (12+ PUNTOS)';
    } else if (bestScore >= 8) {
      verdict = 'COINCIDENCIA PARCIAL (NO CONCLUYENTE <12 PTS)';
    } else {
      verdict = 'NO COINCIDE (NEGATIVO - DACTILOGRAMA DISTINTO)';
    }

    return {
      isMatch,
      score: bestScore,
      percentage,
      matchedPairs: bestPairs,
      probeCount: probeMinutiae.length,
      refCount: refMinutiae.length,
      verdict,
      rotation: Math.round((bestTransform.angle * 180) / Math.PI),
      translation: {
        dx: Math.round(bestTransform.dx),
        dy: Math.round(bestTransform.dy)
      }
    };
  }

  /**
   * Render Neon laser matching graphics between the two viewports
   */
  renderNeonMatchVisualization(canvasA, canvasB, matchedPairs, progress = 1.0) {
    if (!canvasA || !canvasB) return;

    const ctxA = canvasA.getContext('2d');
    const ctxB = canvasB.getContext('2d');

    const visibleCount = Math.floor(matchedPairs.length * progress);

    for (let i = 0; i < visibleCount; i++) {
      const pair = matchedPairs[i];
      const p = pair.probe;
      const r = pair.reference;

      // Glow effect on Canvas A (Probe)
      ctxA.save();
      ctxA.shadowColor = '#00e5ff';
      ctxA.shadowBlur = 8;
      ctxA.strokeStyle = '#00e5ff';
      ctxA.lineWidth = 2;
      ctxA.beginPath();
      ctxA.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctxA.stroke();

      ctxA.fillStyle = '#00ff88';
      ctxA.beginPath();
      ctxA.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctxA.fill();
      ctxA.restore();

      // Glow effect on Canvas B (Reference)
      ctxB.save();
      ctxB.shadowColor = '#00ff88';
      ctxB.shadowBlur = 8;
      ctxB.strokeStyle = '#00ff88';
      ctxB.lineWidth = 2;
      ctxB.beginPath();
      ctxB.arc(r.x, r.y, 5, 0, Math.PI * 2);
      ctxB.stroke();

      ctxB.fillStyle = '#00e5ff';
      ctxB.beginPath();
      ctxB.arc(r.x, r.y, 2, 0, Math.PI * 2);
      ctxB.fill();
      ctxB.restore();
    }
  }
}
