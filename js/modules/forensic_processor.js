/**
 * LiveScan Mobile Forensic - Forensic Image Processor
 * High-performance browser-based dactyloscopic engine:
 * - Grayscale & Contrast Equalization
 * - Papillary Ridge ROI Segmentation (Filtro Pericial de Dactilograma)
 * - Orientation Field & Coherence Estimation (Sobel Gradient Tensor)
 * - Adaptive Sauvola Binarization with Mask Constraint (Zero background noise)
 * - Morphological Skeletonization (Zhang-Suen Thinning Algorithm)
 * - Minutiae Extraction (Terminations & Bifurcations with Crossing Number)
 * - False Minutiae Pruning (Spurs, Silhouette Borders, Closely-paired noise)
 * - NFIQ-like NIST Quality Metric Calculation (Scores 1 to 5)
 */

export class ForensicProcessor {
  constructor() {
    this.width = 0;
    this.height = 0;
  }

  /**
   * Process a source image or canvas and return all forensic analytical layers
   */
  process(sourceCanvas) {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    this.width = width;
    this.height = height;

    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1. Grayscale matrix
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      // Standard luminous weights
      gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    // 2. Local Contrast Normalization (CLAHE / local stretch)
    const normalized = this._normalizeContrast(gray, width, height);

    // 3. Orientation Field, Coherence & Dactyloscopic Ridge ROI Segmentation Mask
    const blockSize = 10;
    const {
      orientationField,
      coherenceField,
      avgCoherence,
      roiMask,
      ridgeCoverageRatio
    } = this._computeOrientationAndSegmentation(normalized, width, height, blockSize);

    // 4. Mask-Constrained Adaptive Binarization (Sauvola local threshold)
    // Completely suppresses background, table, wires, and outer finger borders
    const binary = this._adaptiveBinarize(normalized, width, height, roiMask, 14, 0.18);

    // 5. Morphological Skeletonization (Zhang-Suen Thinning)
    const skeleton = this._zhangSuenThinning(binary, width, height);

    // 6. Minutiae Detection (Crossing Number strictly inside Papillary ROI)
    const rawMinutiae = this._extractMinutiae(skeleton, width, height, roiMask, orientationField, coherenceField, blockSize);

    // 7. Prune False Minutiae (Borders, Spurs, Doublets)
    const minutiae = this._pruneMinutiae(rawMinutiae, skeleton, width, height, roiMask);

    // 8. NFIQ Quality Metric (1 = Excellent, 5 = Poor)
    const nfiqResult = this._computeNFIQ(normalized, binary, minutiae, avgCoherence, ridgeCoverageRatio, width, height);

    return {
      width,
      height,
      gray,
      normalized,
      binary,
      skeleton,
      roiMask,
      orientationField,
      coherenceField,
      minutiae,
      nfiq: nfiqResult
    };
  }

  /**
   * Local contrast normalization
   */
  _normalizeContrast(gray, w, h) {
    const out = new Float32Array(w * h);
    let min = 255, max = 0;
    for (let i = 0; i < gray.length; i += 2) {
      if (gray[i] < min) min = gray[i];
      if (gray[i] > max) max = gray[i];
    }
    const range = (max - min) || 1;

    for (let i = 0; i < gray.length; i++) {
      let val = ((gray[i] - min) / range) * 255.0;
      out[i] = Math.max(0, Math.min(255, val));
    }
    return out;
  }

  /**
   * Orientation Field calculation using Sobel gradient squared tensors
   * AND Dactyloscopic Papillary Ridge ROI Segmentation with Morphological Erosion
   */
  _computeOrientationAndSegmentation(gray, w, h, blockSize) {
    const blocksX = Math.floor(w / blockSize);
    const blocksY = Math.floor(h / blockSize);
    const numBlocks = blocksX * blocksY;

    const orientationField = new Float32Array(numBlocks);
    const coherenceField = new Float32Array(numBlocks);
    const blockVariance = new Float32Array(numBlocks);
    const rawBlockMask = new Uint8Array(numBlocks);

    let totalCoherence = 0;
    let countedBlocks = 0;

    // Step 1: Compute per-block gradient tensor, orientation, coherence, and variance
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const bIdx = by * blocksX + bx;
        const startX = bx * blockSize;
        const startY = by * blockSize;

        let V_x = 0;
        let V_y = 0;
        let sumMag = 0;
        let sumGray = 0;
        let sumSqGray = 0;
        let pixelCount = 0;

        for (let y = startY; y < startY + blockSize && y < h; y++) {
          for (let x = startX; x < startX + blockSize && x < w; x++) {
            const idx = y * w + x;
            const g = gray[idx];
            sumGray += g;
            sumSqGray += g * g;
            pixelCount++;

            if (y > 0 && y < h - 1 && x > 0 && x < w - 1) {
              const gx = (
                -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
                -2 * gray[y * w + (x - 1)]   + 2 * gray[y * w + (x + 1)] +
                -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)]
              ) / 8.0;

              const gy = (
                -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
                 gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)]
              ) / 8.0;

              V_x += 2.0 * gx * gy;
              V_y += (gx * gx - gy * gy);
              sumMag += (gx * gx + gy * gy);
            }
          }
        }

        const meanG = sumGray / (pixelCount || 1);
        const variance = Math.max(0, (sumSqGray / (pixelCount || 1)) - (meanG * meanG));
        const stdDev = Math.sqrt(variance);
        blockVariance[bIdx] = stdDev;

        const angle = 0.5 * Math.atan2(V_x, V_y);
        orientationField[bIdx] = angle;

        const coherence = sumMag > 0.001 ? Math.sqrt(V_x * V_x + V_y * V_y) / sumMag : 0;
        const normCoherence = Math.min(1.0, coherence);
        coherenceField[bIdx] = normCoherence;

        // Dactyloscopic Papillary Ridge Criteria:
        // True ridges have oscillating contrast (stdDev >= 9.0), gradient power (sumMag >= 12.0),
        // and directional coherence >= 0.22. Flat background, table, or wall fails this.
        if (normCoherence >= 0.22 && stdDev >= 9.0 && sumMag >= 12.0) {
          rawBlockMask[bIdx] = 1;
          totalCoherence += normCoherence;
          countedBlocks++;
        }
      }
    }

    const avgCoherence = countedBlocks > 0 ? (totalCoherence / countedBlocks) : 0;

    // Step 2: Morphological Closing on block mask (fill tiny pores / holes inside finger)
    const closedMask = new Uint8Array(numBlocks);
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const bIdx = by * blocksX + bx;
        if (rawBlockMask[bIdx] === 1) {
          closedMask[bIdx] = 1;
        } else {
          // If 5 or more 8-neighbors are valid ridges, bridge the hole
          let neighborCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nby = by + dy;
              const nbx = bx + dx;
              if (nby >= 0 && nby < blocksY && nbx >= 0 && nbx < blocksX) {
                if (rawBlockMask[nby * blocksX + nbx] === 1) neighborCount++;
              }
            }
          }
          if (neighborCount >= 5) {
            closedMask[bIdx] = 1;
          }
        }
      }
    }

    // Step 3: Morphological Erosion (Margen de Seguridad Dactilar)
    // Erode the mask by 2 full blocks (approx. 20 pixels inward)
    // This strictly strips out the outer finger silhouette contour, fingernail edges,
    // and boundary noise where false minutiae are typically generated.
    const erodedMask = new Uint8Array(numBlocks);
    const erosionRadius = 2;

    for (let by = erosionRadius; by < blocksY - erosionRadius; by++) {
      for (let bx = erosionRadius; bx < blocksX - erosionRadius; bx++) {
        let allValid = true;
        for (let dy = -erosionRadius; dy <= erosionRadius && allValid; dy++) {
          for (let dx = -erosionRadius; dx <= erosionRadius; dx++) {
            const nby = by + dy;
            const nbx = bx + dx;
            if (closedMask[nby * blocksX + nbx] !== 1) {
              allValid = false;
              break;
            }
          }
        }
        if (allValid) {
          erodedMask[by * blocksX + bx] = 1;
        }
      }
    }

    // Step 4: Map block mask to pixel-level roiMask
    const roiMask = new Uint8Array(w * h);
    let validRidgePixels = 0;

    for (let y = 0; y < h; y++) {
      const by = Math.floor(y / blockSize);
      if (by >= blocksY) continue;
      for (let x = 0; x < w; x++) {
        const bx = Math.floor(x / blockSize);
        if (bx >= blocksX) continue;

        if (erodedMask[by * blocksX + bx] === 1) {
          roiMask[y * w + x] = 1;
          validRidgePixels++;
        }
      }
    }

    const ridgeCoverageRatio = validRidgePixels / (w * h);

    return {
      orientationField,
      coherenceField,
      avgCoherence,
      roiMask,
      ridgeCoverageRatio
    };
  }

  /**
   * Mask-Constrained Adaptive Sauvola Thresholding
   * ONLY binarizes areas strictly inside the Papillary Ridge ROI.
   * Background and outer borders are strictly forced to 0 (no ridges).
   */
  _adaptiveBinarize(gray, w, h, roiMask, radius = 14, k = 0.2) {
    const binary = new Uint8Array(w * h);
    const integral = new Float64Array((w + 1) * (h + 1));
    const integralSq = new Float64Array((w + 1) * (h + 1));

    // Build integral images for rapid mean & std dev lookup
    for (let y = 0; y < h; y++) {
      let sum = 0;
      let sumSq = 0;
      for (let x = 0; x < w; x++) {
        const val = gray[y * w + x];
        sum += val;
        sumSq += val * val;
        const cell = (y + 1) * (w + 1) + (x + 1);
        integral[cell] = integral[y * (w + 1) + (x + 1)] + sum;
        integralSq[cell] = integralSq[y * (w + 1) + (x + 1)] + sumSq;
      }
    }

    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - radius);
      const y2 = Math.min(h - 1, y + radius);

      for (let x = 0; x < w; x++) {
        const pIdx = y * w + x;

        // If outside valid papillary ridge ROI, strictly suppress (background = 0)
        if (roiMask[pIdx] !== 1) {
          binary[pIdx] = 0;
          continue;
        }

        const x1 = Math.max(0, x - radius);
        const x2 = Math.min(w - 1, x + radius);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)]
                  - integral[y1 * (w + 1) + (x2 + 1)]
                  - integral[(y2 + 1) * (w + 1) + x1]
                  + integral[y1 * (w + 1) + x1];

        const sumSq = integralSq[(y2 + 1) * (w + 1) + (x2 + 1)]
                    - integralSq[y1 * (w + 1) + (x2 + 1)]
                    - integralSq[(y2 + 1) * (w + 1) + x1]
                    + integralSq[y1 * (w + 1) + x1];

        const mean = sum / count;
        const variance = Math.max(0, (sumSq / count) - (mean * mean));
        const stdDev = Math.sqrt(variance);

        // If local contrast is flat, it's uniform skin or noise, not a ridge
        if (stdDev < 7.0) {
          binary[pIdx] = 0;
          continue;
        }

        // Sauvola formula: T = mean * (1 + k * (stdDev / 128 - 1))
        const threshold = mean * (1.0 + k * (stdDev / 128.0 - 1.0));
        // Ridge is dark relative to valley
        binary[pIdx] = gray[pIdx] < threshold ? 1 : 0;
      }
    }
    return binary;
  }

  /**
   * High-Performance Zhang-Suen morphological thinning algorithm (Zero GC Array Allocations)
   */
  _zhangSuenThinning(binary, w, h) {
    const s = new Uint8Array(binary);
    let changed = true;
    const toRemove = [];
    let iterations = 0;

    while (changed && iterations < 25) {
      changed = false;
      iterations++;

      // Sub-iteration 1
      for (let y = 1; y < h - 1; y++) {
        const yPrev = (y - 1) * w;
        const yCur = y * w;
        const yNext = (y + 1) * w;

        for (let x = 1; x < w - 1; x++) {
          if (s[yCur + x] !== 1) continue;

          const p2 = s[yPrev + x];
          const p3 = s[yPrev + (x + 1)];
          const p4 = s[yCur + (x + 1)];
          const p5 = s[yNext + (x + 1)];
          const p6 = s[yNext + x];
          const p7 = s[yNext + (x - 1)];
          const p8 = s[yCur + (x - 1)];
          const p9 = s[yPrev + (x - 1)];

          const bVal = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bVal < 2 || bVal > 6) continue;

          let aVal = 0;
          if (p2 === 0 && p3 === 1) aVal++;
          if (p3 === 0 && p4 === 1) aVal++;
          if (p4 === 0 && p5 === 1) aVal++;
          if (p5 === 0 && p6 === 1) aVal++;
          if (p6 === 0 && p7 === 1) aVal++;
          if (p7 === 0 && p8 === 1) aVal++;
          if (p8 === 0 && p9 === 1) aVal++;
          if (p9 === 0 && p2 === 1) aVal++;
          if (aVal !== 1) continue;

          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;

          toRemove.push(yCur + x);
        }
      }

      if (toRemove.length > 0) {
        changed = true;
        while (toRemove.length > 0) s[toRemove.pop()] = 0;
      }

      // Sub-iteration 2
      for (let y = 1; y < h - 1; y++) {
        const yPrev = (y - 1) * w;
        const yCur = y * w;
        const yNext = (y + 1) * w;

        for (let x = 1; x < w - 1; x++) {
          if (s[yCur + x] !== 1) continue;

          const p2 = s[yPrev + x];
          const p3 = s[yPrev + (x + 1)];
          const p4 = s[yCur + (x + 1)];
          const p5 = s[yNext + (x + 1)];
          const p6 = s[yNext + x];
          const p7 = s[yNext + (x - 1)];
          const p8 = s[yCur + (x - 1)];
          const p9 = s[yPrev + (x - 1)];

          const bVal = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bVal < 2 || bVal > 6) continue;

          let aVal = 0;
          if (p2 === 0 && p3 === 1) aVal++;
          if (p3 === 0 && p4 === 1) aVal++;
          if (p4 === 0 && p5 === 1) aVal++;
          if (p5 === 0 && p6 === 1) aVal++;
          if (p6 === 0 && p7 === 1) aVal++;
          if (p7 === 0 && p8 === 1) aVal++;
          if (p8 === 0 && p9 === 1) aVal++;
          if (p9 === 0 && p2 === 1) aVal++;
          if (aVal !== 1) continue;

          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;

          toRemove.push(yCur + x);
        }
      }

      if (toRemove.length > 0) {
        changed = true;
        while (toRemove.length > 0) s[toRemove.pop()] = 0;
      }
    }

    return s;
  }

  /**
   * Minutiae extraction strictly within Papillary Ridge ROI using Crossing Number
   */
  _extractMinutiae(skeleton, w, h, roiMask, orientationField, coherenceField, blockSize) {
    const minutiae = [];
    const blocksX = Math.floor(w / blockSize);

    const safeMargin = 16;
    for (let y = safeMargin; y < h - safeMargin; y++) {
      for (let x = safeMargin; x < w - safeMargin; x++) {
        const pIdx = y * w + x;
        if (skeleton[pIdx] !== 1 || roiMask[pIdx] !== 1) continue;

        // Verify local coherence to avoid random blobs
        const bx = Math.floor(x / blockSize);
        const by = Math.floor(y / blockSize);
        const bIdx = by * blocksX + bx;
        const coherence = coherenceField ? (coherenceField[bIdx] || 0) : 0;
        if (coherence < 0.22) continue;

        // 8-neighbors
        const n = [
          skeleton[(y - 1) * w + x],       // p2
          skeleton[(y - 1) * w + (x + 1)], // p3
          skeleton[y * w + (x + 1)],       // p4
          skeleton[(y + 1) * w + (x + 1)], // p5
          skeleton[(y + 1) * w + x],       // p6
          skeleton[(y + 1) * w + (x - 1)], // p7
          skeleton[y * w + (x - 1)],       // p8
          skeleton[(y - 1) * w + (x - 1)]  // p9
        ];

        // Crossing Number (CN): 0.5 * sum(|p_{i+1} - p_i|)
        let cn = 0;
        for (let i = 0; i < 8; i++) {
          cn += Math.abs(n[(i + 1) % 8] - n[i]);
        }
        cn = Math.floor(cn / 2);

        let type = null;
        if (cn === 1) type = 'termination';
        else if (cn === 3) type = 'bifurcation';

        if (type) {
          const theta = orientationField ? (orientationField[bIdx] || 0) : 0;

          // Trace ridge continuity to eliminate short spurs (< 8 pixels)
          if (type === 'termination') {
            const ridgeLength = this._traceRidgeLength(skeleton, x, y, w, h, 10);
            if (ridgeLength < 7) continue; // False spur
          }

          minutiae.push({
            x,
            y,
            type, // 'termination' | 'bifurcation'
            angle: theta,
            quality: Math.min(1.0, coherence * 1.2)
          });
        }
      }
    }
    return minutiae;
  }

  /**
   * Trace ridge from a candidate point to verify it is a genuine ridge and not a spur
   */
  _traceRidgeLength(skeleton, startX, startY, w, h, maxSteps = 10) {
    let curX = startX;
    let curY = startY;
    let prevX = -1;
    let prevY = -1;
    let steps = 0;

    while (steps < maxSteps) {
      let nextX = -1;
      let nextY = -1;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = curX + dx;
          const ny = curY + dy;
          if (nx === prevX && ny === prevY) continue;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && skeleton[ny * w + nx] === 1) {
            nextX = nx;
            nextY = ny;
            break;
          }
        }
        if (nextX !== -1) break;
      }

      if (nextX === -1) break;
      prevX = curX;
      prevY = curY;
      curX = nextX;
      curY = nextY;
      steps++;
    }
    return steps;
  }

  /**
   * Prune spurious minutiae (boundary artifacts, false bridges, closely-spaced doublets)
   */
  _pruneMinutiae(minutiae, skeleton, w, h, roiMask) {
    const valid = [];
    const minDistance = 12; // Minimum distance between distinct genuine minutiae
    const edgeMargin = 16;

    for (let i = 0; i < minutiae.length; i++) {
      const m1 = minutiae[i];

      // Discard image boundaries
      if (m1.x < edgeMargin || m1.x > w - edgeMargin || m1.y < edgeMargin || m1.y > h - edgeMargin) {
        continue;
      }

      // Ensure at least 10px inside the ROI mask
      let insideRoiSafe = true;
      for (let d = -8; d <= 8; d += 8) {
        if (roiMask[(m1.y + d) * w + m1.x] === 0 || roiMask[m1.y * w + (m1.x + d)] === 0) {
          insideRoiSafe = false;
          break;
        }
      }
      if (!insideRoiSafe) continue;

      // Check distance to already accepted minutiae (suppress duplicate or noisy clusters)
      let tooClose = false;
      for (let j = 0; j < valid.length; j++) {
        const m2 = valid[j];
        const dx = m1.x - m2.x;
        const dy = m1.y - m2.y;
        if (dx * dx + dy * dy < minDistance * minDistance) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        valid.push(m1);
      }
    }

    return valid;
  }

  /**
   * NIST NFIQ-like Quality Estimator
   * Quality ranks from 1 (Forensic Excellent) to 5 (Unusable / Poor)
   */
  _computeNFIQ(normalized, binary, minutiae, avgCoherence, ridgeCoverageRatio, w, h) {
    // 1. Minutiae count validity (Forensic standard: 25 to 80 reliable minutiae)
    const mCount = minutiae.length;
    let minutiaeScore = 0;
    if (mCount >= 20 && mCount <= 90) {
      minutiaeScore = 1.0;
    } else if (mCount >= 12 && mCount < 20) {
      minutiaeScore = 0.75;
    } else if (mCount > 90) {
      minutiaeScore = 0.6; // noisy
    } else {
      minutiaeScore = Math.max(0.1, mCount / 20.0); // sparse
    }

    // 2. Ridge contrast variance inside foreground
    let sumVar = 0;
    let sampled = 0;
    for (let i = 0; i < normalized.length; i += 4) {
      if (binary[i] === 1) {
        const diff = normalized[i] - 128;
        sumVar += diff * diff;
        sampled++;
      }
    }
    const contrastStd = sampled > 0 ? Math.sqrt(sumVar / sampled) : 0;

    // Composite Quality Score (0..100)
    const compositeScore = (
      Math.min(1.0, avgCoherence * 1.6) * 35 +
      minutiaeScore * 30 +
      Math.min(1.0, contrastStd / 60.0) * 20 +
      Math.min(1.0, ridgeCoverageRatio * 4.0) * 15
    );

    // Map to NFIQ Levels (1 = Best, 5 = Worst)
    let nfiqLevel = 5;
    let label = 'Rechazo';
    let color = '#ff3366';

    if (compositeScore >= 75) {
      nfiqLevel = 1;
      label = 'Excelente';
      color = '#00ff88';
    } else if (compositeScore >= 60) {
      nfiqLevel = 2;
      label = 'Muy Buena';
      color = '#00e5ff';
    } else if (compositeScore >= 45) {
      nfiqLevel = 3;
      label = 'Buena';
      color = '#ffb700';
    } else if (compositeScore >= 30) {
      nfiqLevel = 4;
      label = 'Marginal';
      color = '#ff8800';
    } else {
      nfiqLevel = 5;
      label = 'Pobre';
      color = '#ff3366';
    }

    return {
      nfiqLevel,
      label,
      color,
      compositeScore: Math.round(compositeScore),
      metrics: {
        coherence: Math.round(avgCoherence * 100),
        minutiaeCount: mCount,
        coverage: Math.round(ridgeCoverageRatio * 100),
        contrast: Math.round(contrastStd)
      }
    };
  }
}
