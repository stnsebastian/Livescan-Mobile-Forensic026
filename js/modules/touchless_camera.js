/**
 * LiveScan Mobile Forensic - Opción 3: Touchless Macro Camera & Flash Module
 * Captures contactless fingerprints using the smartphone's camera + LED torch.
 * Real-time high-pass ridge enhancement, stability analysis, and auto-snap.
 */

export class TouchlessCameraScanner {
  constructor(videoElement, onStatusChange, onFrameReady) {
    this.video = videoElement;
    this.onStatusChange = onStatusChange || (() => {});
    this.onFrameReady = onFrameReady || (() => {});

    this.stream = null;
    this.track = null;
    this.capabilities = null;
    this.isTorchOn = false;
    this.isActive = false;
    this.animFrameId = null;

    // Stability tracker
    this.prevFrameData = null;
    this.stableFramesCount = 0;
    this.stableThreshold = 18; // consecutive steady frames
  }

  async start() {
    this.onStatusChange({ state: 'starting', message: 'Iniciando cámara macro con flash...' });

    try {
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: { ideal: 'macro' }
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();

      this.track = this.stream.getVideoTracks()[0];
      if (this.track && this.track.getCapabilities) {
        this.capabilities = this.track.getCapabilities();
      }

      this.isActive = true;

      // Auto enable torch if available
      await this.setTorch(true);

      this.onStatusChange({
        state: 'ready',
        hasTorch: !!(this.capabilities && this.capabilities.torch),
        message: 'Cámara lista. Ubique la yema del dedo en la guía oval.'
      });

      this._startProcessingLoop();
    } catch (err) {
      console.warn('Error starting camera stream, launching simulation:', err);
      this._simulateTouchlessCamera();
    }
  }

  async setTorch(enable) {
    if (!this.track) return;
    try {
      if (this.capabilities && this.capabilities.torch) {
        await this.track.applyConstraints({
          advanced: [{ torch: !!enable }]
        });
        this.isTorchOn = !!enable;
      }
    } catch (e) {
      console.warn('Torch constraint not supported on this device:', e);
    }
  }

  toggleTorch() {
    return this.setTorch(!this.isTorchOn);
  }

  async setZoom(zoomLevel) {
    if (!this.track) return;
    try {
      if (this.capabilities && this.capabilities.zoom) {
        await this.track.applyConstraints({
          advanced: [{ zoom: zoomLevel }]
        });
      }
    } catch (e) {
      console.warn('Zoom constraint error:', e);
    }
  }

  _startProcessingLoop() {
    const procCanvas = document.createElement('canvas');
    procCanvas.width = 320;
    procCanvas.height = 420;
    const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });

    const loop = () => {
      if (!this.isActive || !this.video || this.video.readyState < 2) {
        if (this.isActive) this.animFrameId = requestAnimationFrame(loop);
        return;
      }

      // Crop center ROI (Fingerprint region)
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      const cropW = Math.min(vw, vh) * 0.55;
      const cropH = cropW * 1.33;
      const startX = (vw - cropW) / 2;
      const startY = (vh - cropH) / 2;

      procCtx.drawImage(this.video, startX, startY, cropW, cropH, 0, 0, 320, 420);

      // Check finger stability
      const imgData = procCtx.getImageData(0, 0, 320, 420);
      const isSteady = this._checkStability(imgData);

      if (isSteady) {
        this.stableFramesCount++;
        this.onStatusChange({ state: 'steady', stability: Math.min(100, (this.stableFramesCount / this.stableThreshold) * 100) });

        if (this.stableFramesCount >= this.stableThreshold) {
          // Auto snapshot!
          if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
          this.captureSnapshot();
          this.stableFramesCount = 0;
          return;
        }
      } else {
        this.stableFramesCount = Math.max(0, this.stableFramesCount - 2);
        this.onStatusChange({ state: 'moving', stability: 0 });
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  _checkStability(imgData) {
    const data = imgData.data;
    const len = data.length;
    let diff = 0;
    let sampleCount = 0;

    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8Array(len / 8);
      for (let i = 0; i < len; i += 8) {
        this.prevFrameData[i / 8] = data[i];
      }
      return false;
    }

    for (let i = 0; i < len; i += 8) {
      const idx = i / 8;
      diff += Math.abs(data[i] - this.prevFrameData[idx]);
      this.prevFrameData[idx] = data[i];
      sampleCount++;
    }

    const avgDiff = sampleCount > 0 ? (diff / sampleCount) : 999;
    // Low diff indicates steady finger position
    return avgDiff < 4.2;
  }

  /**
   * Take crisp high-resolution snapshot and apply touchless dactyloscopic enhancement
   */
  captureSnapshot() {
    if (!this.video || this.video.readyState < 2) {
      return this._simulateTouchlessCamera();
    }

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const cropW = Math.min(vw, vh) * 0.55;
    const cropH = cropW * 1.33;
    const startX = (vw - cropW) / 2;
    const startY = (vh - cropH) / 2;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = 300;
    outCanvas.height = 400;
    const ctx = outCanvas.getContext('2d');

    // Draw raw crop
    ctx.drawImage(this.video, startX, startY, cropW, cropH, 0, 0, 300, 400);

    // Dactyloscopic Contactless Enhancement (Extract dermal ridges from skin photo)
    this._enhanceTouchlessRidges(outCanvas);

    this.onStatusChange({ state: 'captured', message: 'Huella Touchless capturada con éxito.' });
    this.onFrameReady(outCanvas);
    return outCanvas;
  }

  /**
   * Contactless dactyloscopic enhancement
   * Normalizes illumination gradient from LED flash, highlights ridge patterns
   */
  _enhanceTouchlessRidges(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Green channel usually contains highest contrast for epidermal ridges under flash
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      // High green weight to isolate blood vessel / dermal ridge absorption
      gray[i] = 0.15 * d[idx] + 0.70 * d[idx + 1] + 0.15 * d[idx + 2];
    }

    // High pass / Laplacian kernel to extract ridge peaks
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const center = gray[y * w + x];
        const lap = (
          -1 * gray[(y - 1) * w + x] +
          -1 * gray[y * w + (x - 1)] +
           4 * center +
          -1 * gray[y * w + (x + 1)] +
          -1 * gray[(y + 1) * w + x]
        );

        // High contrast mapping
        const val = Math.max(0, Math.min(255, 128 - lap * 2.5));
        const idx = (y * w + x) * 4;
        d[idx] = val;
        d[idx + 1] = val;
        d[idx + 2] = val;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  stop() {
    this.isActive = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.track) {
      this.setTorch(false);
      this.track.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    this.stream = null;
    this.track = null;
    this.onStatusChange({ state: 'stopped', message: 'Cámara apagada.' });
  }

  _simulateTouchlessCamera() {
    this.onStatusChange({ state: 'starting', message: '[SIMULADOR TOUCHLESS] Procesando toma macro con flash LED...' });

    return new Promise((resolve) => {
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // Flesh-tone under flash lighting
        ctx.fillStyle = '#f9e0db';
        ctx.fillRect(0, 0, 300, 400);

        ctx.save();
        ctx.translate(150, 200);

        ctx.beginPath();
        ctx.ellipse(0, 0, 100, 145, 0, 0, Math.PI * 2);
        ctx.clip();

        // Fingerprint skin background
        const grad = ctx.createRadialGradient(0, -30, 20, 0, 0, 150);
        grad.addColorStop(0, '#ffffff'); // Flash reflection hotspot
        grad.addColorStop(0.5, '#f5d2c8');
        grad.addColorStop(1, '#df9e8e');
        ctx.fillStyle = grad;
        ctx.fillRect(-150, -200, 300, 400);

        // Ridge texture
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#6e3c32';

        for (let r = 8; r <= 160; r += 7.0) {
          ctx.beginPath();
          for (let a = 0; a <= Math.PI * 2; a += 0.05) {
            const pert = Math.sin(a * 3.0 + r * 0.12) * 3.5 + Math.cos(a * 2.5) * 2;
            const rx = (r + pert) * 0.82;
            const ry = (r + pert) * 1.30;
            const x = Math.cos(a) * rx;
            const y = Math.sin(a) * ry + (a > Math.PI ? (a - Math.PI) * 10 : 0);
            if (a === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        ctx.restore();

        // Enhance
        this._enhanceTouchlessRidges(canvas);

        this.onStatusChange({ state: 'captured', message: 'Huella Touchless capturada y mejorada.' });
        this.onFrameReady(canvas);
        resolve(canvas);
      }, 700);
    });
  }
}
