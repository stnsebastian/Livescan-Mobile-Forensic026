/**
 * LiveScan Mobile Forensic - Opción 3: Touchless Macro Camera & Flash Module
 * Captures contactless fingerprints using the smartphone's camera + LED torch.
 * - Live Full-Color Viewfinder with Reticle
 * - Manual Shutter Trigger (User decides when focus is razor-sharp)
 * - Auto-snapshot disabled to prevent premature blurry captures
 * - Preserves natural color dactyloscopic texture
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

    // Stability tracker (visual guidance only, NO auto-snap)
    this.prevFrameData = null;
    this.stableFramesCount = 0;
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
          focusMode: { ideal: 'continuous' }
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
        message: 'Alinee el dedo a 6-10 cm. Cuando esté bien enfocado, presione CAPTURAR.'
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

  async triggerAutofocus() {
    if (!this.track) return;
    try {
      // Re-trigger continuous autofocus
      await this.track.applyConstraints({
        advanced: [{ focusMode: 'continuous' }]
      });
      this.onStatusChange({ state: 'focusing', message: 'Reenfocando lente macro...' });
    } catch (e) {
      console.warn('Focus constraint error:', e);
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

      // Check finger stability for UI guide ONLY (no auto-snap!)
      const imgData = procCtx.getImageData(0, 0, 320, 420);
      const isSteady = this._checkStability(imgData);

      if (isSteady) {
        this.stableFramesCount = Math.min(30, this.stableFramesCount + 1);
        if (this.stableFramesCount > 15) {
          this.onStatusChange({ state: 'steady', stability: 100, message: 'Dedo estable. Presione CAPTURAR cuando esté enfocado.' });
        }
      } else {
        this.stableFramesCount = Math.max(0, this.stableFramesCount - 2);
        this.onStatusChange({ state: 'moving', stability: 0, message: 'Mueva el dedo suavemente hasta ver las crestas nítidas.' });
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
    return avgDiff < 4.5;
  }

  /**
   * Take crisp high-resolution snapshot in TRUE NATURAL COLOR
   * The user triggers this manually when the image is perfectly in focus.
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

    // Draw raw high-resolution color crop directly from video
    ctx.drawImage(this.video, startX, startY, cropW, cropH, 0, 0, 300, 400);

    // Natural color dactyloscopic enhancement (improves ridge contrast without turning into flat gray)
    this._enhanceNaturalColorRidges(outCanvas);

    this.onStatusChange({ state: 'captured', message: 'Huella Touchless capturada y analizada.' });
    this.onFrameReady(outCanvas);
    return outCanvas;
  }

  /**
   * Natural color ridge enhancement
   * Stretches dynamic contrast of the green/red channels while PRESERVING true skin color
   */
  _enhanceNaturalColorRidges(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    // Find min and max luminance for linear contrast stretch
    let minLum = 255;
    let maxLum = 0;

    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = (maxLum - minLum) || 1;
    const contrastFactor = 1.25;

    for (let i = 0; i < d.length; i += 4) {
      // Natural stretch on all color channels
      for (let c = 0; c < 3; c++) {
        let val = ((d[i + c] - minLum) / range) * 255.0;
        // Moderate S-curve boost for ridges
        val = (val - 128) * contrastFactor + 128;
        d[i + c] = Math.max(0, Math.min(255, val));
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
    this.onStatusChange({ state: 'starting', message: '[SIMULADOR TOUCHLESS] Generando captura macro...' });

    return new Promise((resolve) => {
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // Natural flesh tone background
        ctx.fillStyle = '#eddcd2';
        ctx.fillRect(0, 0, 300, 400);

        ctx.save();
        ctx.translate(150, 200);

        ctx.beginPath();
        ctx.ellipse(0, 0, 100, 145, 0, 0, Math.PI * 2);
        ctx.clip();

        // Fingerprint skin background
        const grad = ctx.createRadialGradient(0, -30, 20, 0, 0, 150);
        grad.addColorStop(0, '#fff0eb');
        grad.addColorStop(0.5, '#eecac0');
        grad.addColorStop(1, '#cb9080');
        ctx.fillStyle = grad;
        ctx.fillRect(-150, -200, 300, 400);

        // Ridge texture in natural skin ridge tone
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = '#5a2e26';

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

        this._enhanceNaturalColorRidges(canvas);

        this.onStatusChange({ state: 'captured', message: 'Huella Touchless capturada y analizada.' });
        this.onFrameReady(canvas);
        resolve(canvas);
      }, 500);
    });
  }
}
