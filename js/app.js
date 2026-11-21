/**
 * LiveScan Mobile Forensic - Main Application Controller
 * Coordinates USB OTG, Wi-Fi RealScan Bridge, Touchless Camera,
 * Forensic Image Processor, 1:1 AFIS Matcher, and IndexedDB Storage.
 */

import { forensicDB } from './modules/db.js';
import { ForensicProcessor } from './modules/forensic_processor.js';
import { AFISMatcher } from './modules/afis_matcher.js';
import { WebUSBScanner } from './modules/otg_usb.js';
import { WiFiRealScanBridge } from './modules/wifi_bridge.js';
import { TouchlessCameraScanner } from './modules/touchless_camera.js';

class LiveScanApp {
  constructor() {
    this.activeMode = 'usb'; // 'usb' | 'wifi' | 'touchless'
    this.activeLayer = 'raw'; // 'raw' | 'binary' | 'skeleton' | 'minutiae'
    this.currentCaptureType = 'ROLLED'; // 'ROLLED' | 'FLAT_SINGLE' | 'SLAP_3_4' | 'DUAL_THUMBS'
    this.currentTheme = localStorage.getItem('livescan_theme') || 'dark';
    this.isCapturing = false;

    this.currentRawCanvas = null;
    this.currentForensicResult = null;

    // 1:1 Matching State
    this.probeResult = null;
    this.refResult = null;

    // Engines
    this.processor = new ForensicProcessor();
    this.matcher = new AFISMatcher();

    // DOM Elements
    this.dom = {
      // Nav & Tabs
      navItems: document.querySelectorAll('.nav-item'),
      tabViews: document.querySelectorAll('.tab-view'),
      // Header & Status
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      btnThemeToggle: document.getElementById('btnThemeToggle'),
      iconThemeSun: document.getElementById('iconThemeSun'),
      iconThemeMoon: document.getElementById('iconThemeMoon'),
      btnBridgeSettings: document.getElementById('btnBridgeSettings'),
      // Mode & Modality Dropdowns
      dropdownOrigin: document.getElementById('dropdownOrigin'),
      triggerOrigin: document.getElementById('triggerOrigin'),
      originIcon: document.getElementById('originIcon'),
      originText: document.getElementById('originText'),
      originItems: document.querySelectorAll('#menuOrigin .dropdown-item'),
      dropdownModality: document.getElementById('dropdownModality'),
      triggerModality: document.getElementById('triggerModality'),
      modalityIcon: document.getElementById('modalityIcon'),
      modalityText: document.getElementById('modalityText'),
      modalityItems: document.querySelectorAll('#menuModality .dropdown-item'),
      // Viewport & canvases
      mainCanvas: document.getElementById('mainCanvas'),
      overlayCanvas: document.getElementById('overlayCanvas'),
      scannerVideo: document.getElementById('scannerVideo'),
      touchlessReticle: document.getElementById('touchlessReticle'),
      reticleLabel: document.getElementById('reticleLabel'),
      // HUD
      hudNfiq: document.getElementById('hudNfiq'),
      hudMinutiaeCount: document.getElementById('hudMinutiaeCount'),
      layerBtns: document.querySelectorAll('.layer-btn'),
      // USB params & connect
      usbControlsBar: document.getElementById('usbControlsBar'),
      btnConnectUsb: document.getElementById('btnConnectUsb'),
      usbConnectIcon: document.getElementById('usbConnectIcon'),
      usbConnectLabel: document.getElementById('usbConnectLabel'),
      usbStatusBadge: document.getElementById('usbStatusBadge'),
      usbActionsSecondary: document.getElementById('usbActionsSecondary'),
      btnToggleUsbLight: document.getElementById('btnToggleUsbLight'),
      usbLightIcon: document.getElementById('usbLightIcon'),
      usbLightLabel: document.getElementById('usbLightLabel'),
      btnDirectUsbCapture: document.getElementById('btnDirectUsbCapture'),
      btnAndroidHelp: document.getElementById('btnAndroidHelp') || document.getElementById('btnSamsungHelp'),
      btnSamsungHelp: document.getElementById('btnSamsungHelp') || document.getElementById('btnAndroidHelp'),
      samsungBrowserBanner: document.getElementById('samsungBrowserBanner'),
      btnCloseSamsungBanner: document.getElementById('btnCloseSamsungBanner'),
      samsungHelpModal: document.getElementById('samsungHelpModal'),
      btnCloseSamsungModal: document.getElementById('btnCloseSamsungModal'),
      btnAckSamsungHelp: document.getElementById('btnAckSamsungHelp'),
      // Touchless params
      touchlessParamsBar: document.getElementById('touchlessParamsBar'),
      btnToggleFlash: document.getElementById('btnToggleFlash'),
      zoomSlider: document.getElementById('zoomSlider'),
      // Controls
      btnMainCapture: document.getElementById('btnMainCapture'),
      captureBtnLabel: document.getElementById('captureBtnLabel'),
      btnOpenSaveModal: document.getElementById('btnOpenSaveModal'),
      btnSendToMatch: document.getElementById('btnSendToMatch'),
      // Matcher Elements
      matchProbeCanvas: document.getElementById('matchProbeCanvas'),
      matchRefCanvas: document.getElementById('matchRefCanvas'),
      neonLaserSweep: document.getElementById('neonLaserSweep'),
      btnExecuteMatch: document.getElementById('btnExecuteMatch'),
      btnSelectRefDb: document.getElementById('btnSelectRefDb'),
      radialScoreIndicator: document.getElementById('radialScoreIndicator'),
      matchPercentage: document.getElementById('matchPercentage'),
      matchVerdictBanner: document.getElementById('matchVerdictBanner'),
      statMatchedPoints: document.getElementById('statMatchedPoints'),
      statRotation: document.getElementById('statRotation'),
      statDecision: document.getElementById('statDecision'),
      // Database Elements
      recordsList: document.getElementById('recordsList'),
      dbSearchInput: document.getElementById('dbSearchInput'),
      btnExportDb: document.getElementById('btnExportDb'),
      btnImportDb: document.getElementById('btnImportDb'),
      importFileInput: document.getElementById('importFileInput'),
      // Modals
      saveRecordModal: document.getElementById('saveRecordModal'),
      btnCloseSaveModal: document.getElementById('btnCloseSaveModal'),
      btnConfirmSaveRecord: document.getElementById('btnConfirmSaveRecord'),
      inputFullName: document.getElementById('inputFullName'),
      inputDocId: document.getElementById('inputDocId'),
      inputCaptureTypeSelect: document.getElementById('inputCaptureTypeSelect'),
      inputFingerSelect: document.getElementById('inputFingerSelect'),
      inputCaseNumber: document.getElementById('inputCaseNumber'),
      inputOfficer: document.getElementById('inputOfficer'),
      bridgeConfigModal: document.getElementById('bridgeConfigModal'),
      btnCloseBridgeModal: document.getElementById('btnCloseBridgeModal'),
      inputBridgeUrl: document.getElementById('inputBridgeUrl'),
      btnSaveBridgeUrl: document.getElementById('btnSaveBridgeUrl'),
      btnTestBridgeSim: document.getElementById('btnTestBridgeSim'),
      // Toast
      toastContainer: document.getElementById('toast-container')
    };

    // Initialize Capture Subsystems
    this.usbScanner = new WebUSBScanner(
      (st) => this.handleStatusChange('USB', st),
      (canvas) => this.handleIncomingFrame(canvas)
    );

    this.wifiBridge = new WiFiRealScanBridge(
      (st) => this.handleStatusChange('Wi-Fi', st),
      (canvas) => this.handleIncomingFrame(canvas)
    );

    this.touchlessCam = new TouchlessCameraScanner(
      this.dom.scannerVideo,
      (st) => this.handleStatusChange('Touchless', st),
      (canvas) => this.handleIncomingFrame(canvas)
    );

    this.init();
  }

  async init() {
    try {
      this.applyTheme(this.currentTheme);
    } catch (e) {
      console.warn('Theme init warning:', e);
    }

    try {
      this.bindEvents();
    } catch (e) {
      console.error('Events binding error:', e);
    }

    try {
      this.drawInitialPlaceholder();
    } catch (e) {
      console.warn('Canvas placeholder warning:', e);
    }

    try {
      await forensicDB.init();
      await this.renderDatabaseList();
    } catch (e) {
      console.warn('Database init warning:', e);
    }

    try {
      this.registerServiceWorker();
    } catch (e) {
      console.warn('SW register warning:', e);
    }

    // Auto-detect previously paired USB scanner (e.g. RealScan-D)
    if (this.activeMode === 'usb') {
      try {
        await this.usbScanner.checkAutoConnect();
      } catch (e) {
        console.warn('Auto USB connect notice:', e);
      }
    }

    if (!navigator.onLine) {
      this.setStatus('active', 'Modo Autónomo (Offline)');
      this.showToast('Modo Autónomo: Operando 100% sin internet.');
    } else {
      this.showToast('LiveScan Mobile Forensic inicializado.');
    }

    // Samsung Galaxy A06 / Samsung Internet detector
    const ua = navigator.userAgent || '';
    if (/SamsungBrowser/i.test(ua)) {
      if (this.dom.samsungBrowserBanner) {
        this.dom.samsungBrowserBanner.style.display = 'flex';
      }
      this.showToast('📱 En Samsung: use Google Chrome para conectar lectores USB.', 7000);
    }
  }

  bindEvents() {
    // Offline / Autonomous status monitor
    window.addEventListener('offline', () => {
      this.setStatus('active', 'Modo Autónomo (Sin Internet)');
      this.showToast('📶 Modo Autónomo: Operando 100% offline.');
    });

    window.addEventListener('online', () => {
      this.setStatus('active', 'Listo');
      this.showToast('🌐 Conexión de red detectada.');
    });

    // Theme Toggle (Modo Día / Modo Noche)
    if (this.dom.btnThemeToggle) {
      this.dom.btnThemeToggle.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // Navigation Tabs
    this.dom.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Dropdown Toggles
    if (this.dom.triggerOrigin) {
      this.dom.triggerOrigin.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.dropdownModality?.classList.remove('open');
        this.dom.dropdownOrigin.classList.toggle('open');
      });
    }

    if (this.dom.triggerModality) {
      this.dom.triggerModality.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.dropdownOrigin?.classList.remove('open');
        this.dom.dropdownModality.classList.toggle('open');
      });
    }

    // Close Dropdowns on Click Outside
    document.addEventListener('click', (e) => {
      if (this.dom.dropdownOrigin && !this.dom.dropdownOrigin.contains(e.target)) {
        this.dom.dropdownOrigin.classList.remove('open');
      }
      if (this.dom.dropdownModality && !this.dom.dropdownModality.contains(e.target)) {
        this.dom.dropdownModality.classList.remove('open');
      }
    });

    // Capture Mode Selector (Origin dropdown items)
    this.dom.originItems?.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = item.getAttribute('data-mode');
        this.switchMode(mode);
        this.dom.dropdownOrigin?.classList.remove('open');
      });
    });

    // Biometric Fingerprint Type Selector (Modality dropdown items)
    this.dom.modalityItems?.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = item.getAttribute('data-type');
        this.setCaptureType(type);
        this.dom.dropdownModality?.classList.remove('open');
      });
    });

    // Layer Switcher Buttons
    this.dom.layerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        this.setLayer(layer);
      });
    });

    // Main Trigger Button
    this.dom.btnMainCapture.addEventListener('click', () => {
      this.toggleCapture();
    });

    // USB Scanner Direct Connection Button
    if (this.dom.btnConnectUsb) {
      this.dom.btnConnectUsb.addEventListener('click', () => {
        this.toggleUsbConnection();
      });
    }

    // Android / Tablet / Samsung Guidance Modal Events
    const triggerHelpModal = () => {
      this.dom.samsungHelpModal?.classList.add('active');
    };
    if (this.dom.btnAndroidHelp) this.dom.btnAndroidHelp.addEventListener('click', triggerHelpModal);
    if (this.dom.btnSamsungHelp && this.dom.btnSamsungHelp !== this.dom.btnAndroidHelp) {
      this.dom.btnSamsungHelp.addEventListener('click', triggerHelpModal);
    }

    if (this.dom.btnCloseSamsungModal) {
      this.dom.btnCloseSamsungModal.addEventListener('click', () => {
        this.dom.samsungHelpModal?.classList.remove('active');
      });
    }

    if (this.dom.btnAckSamsungHelp) {
      this.dom.btnAckSamsungHelp.addEventListener('click', () => {
        this.dom.samsungHelpModal?.classList.remove('active');
      });
    }

    if (this.dom.btnCloseSamsungBanner) {
      this.dom.btnCloseSamsungBanner.addEventListener('click', () => {
        if (this.dom.samsungBrowserBanner) {
          this.dom.samsungBrowserBanner.style.display = 'none';
        }
      });
    }

    // USB Scanner Direct Light & Sensor Toggle
    if (this.dom.btnToggleUsbLight) {
      this.dom.btnToggleUsbLight.addEventListener('click', async () => {
        try {
          const isNowOn = await this.usbScanner.togglePrismLight(this.currentCaptureType);
          this.dom.btnToggleUsbLight.classList.toggle('active', isNowOn);
          const dev = this.usbScanner.device;
          const isZK = dev && (dev.vendorId === 0x1b55 || /biokey|zk/i.test(dev.productName || ''));
          const lightColorIcon = isZK ? '🔴' : '🟢';
          const lightLabel = isZK ? 'LUZ ROJA' : 'LUZ PRISMA';
          if (this.dom.usbLightIcon) this.dom.usbLightIcon.textContent = isNowOn ? lightColorIcon : '💡';
          if (this.dom.usbLightLabel) {
            this.dom.usbLightLabel.textContent = isNowOn ? `APAGAR ${lightLabel}` : `ENCENDER ${lightLabel}`;
          }
          if (navigator.vibrate) navigator.vibrate(40);
          this.showToast(isNowOn ? `${lightColorIcon} Señal enviada para encender sensor óptico.` : 'Luz apagada.');
        } catch (err) {
          this.showToast(err.message || 'Error al cambiar estado de luz USB.');
        }
      });
    }

    // Direct USB Forensic Capture Button
    if (this.dom.btnDirectUsbCapture) {
      this.dom.btnDirectUsbCapture.addEventListener('click', async () => {
        this.showToast(`Adquiriendo huella pericial (${this.currentCaptureType})...`);
        try {
          this.isCapturing = true;
          this.updateCaptureButton(true);
          await this.usbScanner.startCapture(this.currentCaptureType);
        } catch (err) {
          console.error('Direct capture error:', err);
          this.showToast(err.message || 'Error en la captura óptica.', 5000);
        } finally {
          this.isCapturing = false;
          this.updateCaptureButton(false);
        }
      });
    }

    // Touchless Flash/Torch Control
    this.dom.btnToggleFlash.addEventListener('click', async () => {
      // If camera is not yet active, activate camera first
      if (!this.touchlessCam.isActive) {
        this.dom.scannerVideo.style.display = 'block';
        this.dom.touchlessReticle.classList.add('active');
        this.isCapturing = true;
        this.updateCaptureButton(true, '📸 TOMAR FOTO (DISPARAR)');
        await this.touchlessCam.start();
      }

      const active = await this.touchlessCam.toggleTorch();
      this.dom.btnToggleFlash.classList.toggle('active', !!active);
      this.showToast(active ? 'Linterna Flash ACTIVADA' : 'Linterna Flash apagada');
    });

    this.dom.zoomSlider.addEventListener('input', (e) => {
      this.touchlessCam.setZoom(parseFloat(e.target.value));
    });

    // Tap to focus on camera preview
    const tapFocusHandler = async () => {
      if (this.activeMode === 'touchless' && this.touchlessCam.isActive) {
        if (navigator.vibrate) navigator.vibrate(25);
        await this.touchlessCam.triggerAutofocus();
        this.showToast('Enfocando lente macro...');
      }
    };
    this.dom.scannerVideo.addEventListener('click', tapFocusHandler);
    this.dom.touchlessReticle.addEventListener('click', tapFocusHandler);

    // Send to match button
    this.dom.btnSendToMatch.addEventListener('click', () => {
      if (!this.currentForensicResult) {
        this.showToast('Primero capture una huella dactilar.');
        return;
      }
      this.loadProbeForMatch(this.currentRawCanvas, this.currentForensicResult);
      this.switchTab('tabMatch');
      this.showToast('Huella cargada como Evidencia (Probe).');
    });

    // 1:1 Match Trigger
    this.dom.btnExecuteMatch.addEventListener('click', () => {
      this.execute1to1Match();
    });

    this.dom.btnSelectRefDb.addEventListener('click', () => {
      this.switchTab('tabDatabase');
      this.showToast('Seleccione un registro dactilar de la lista para cotejar.');
    });

    // Database UI events
    this.dom.dbSearchInput.addEventListener('input', (e) => {
      this.renderDatabaseList(e.target.value);
    });

    this.dom.btnExportDb.addEventListener('click', async () => {
      const json = await forensicDB.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LiveScan_Forensic_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Base de datos exportada en JSON.');
    });

    this.dom.btnImportDb.addEventListener('click', () => {
      this.dom.importFileInput.click();
    });

    this.dom.importFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const count = await forensicDB.importJSON(evt.target.result);
          this.showToast(`Se importaron ${count} registros con éxito.`);
          this.renderDatabaseList();
        } catch (err) {
          this.showToast('Error al importar archivo JSON.');
        }
      };
      reader.readAsText(file);
    });

    // Save Record Modal
    this.dom.btnOpenSaveModal.addEventListener('click', () => {
      if (!this.currentForensicResult) {
        this.showToast('Debe capturar una huella antes de guardar.');
        return;
      }
      this.dom.saveRecordModal.classList.add('active');
    });

    this.dom.btnCloseSaveModal.addEventListener('click', () => {
      this.dom.saveRecordModal.classList.remove('active');
    });

    this.dom.btnConfirmSaveRecord.addEventListener('click', () => {
      this.saveCurrentRecord();
    });

    // Bridge Settings Modal
    this.dom.btnBridgeSettings.addEventListener('click', () => {
      this.dom.inputBridgeUrl.value = this.wifiBridge.getBridgeUrl();
      this.dom.bridgeConfigModal.classList.add('active');
    });

    this.dom.btnCloseBridgeModal.addEventListener('click', () => {
      this.dom.bridgeConfigModal.classList.remove('active');
    });

    this.dom.btnSaveBridgeUrl.addEventListener('click', async () => {
      const url = this.dom.inputBridgeUrl.value.trim();
      if (url) {
        this.wifiBridge.setBridgeUrl(url);
        this.dom.bridgeConfigModal.classList.remove('active');
        if (this.activeMode === 'wifi') {
          await this.wifiBridge.connect(url);
        }
        this.showToast('Dirección de RealScan Bridge guardada.');
      }
    });

    this.dom.btnTestBridgeSim.addEventListener('click', () => {
      this.dom.bridgeConfigModal.classList.remove('active');
      this.switchMode('wifi');
      this.wifiBridge._startSimulatorMode('Modo simulación RealScan Wi-Fi activo.');
      this.showToast('Simulador de RealScan PC Bridge listo.');
    });
  }

  switchTab(tabId) {
    this.dom.navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });
    this.dom.tabViews.forEach(view => {
      view.classList.toggle('active', view.id === tabId);
    });

    // Pause camera if switching away from capture tab
    if (tabId !== 'tabCapture' && this.activeMode === 'touchless') {
      this.touchlessCam.stop();
      this.dom.scannerVideo.style.display = 'none';
      this.dom.touchlessReticle.classList.remove('active');
      this.isCapturing = false;
      this.updateCaptureButton(false);
    }
  }

  async switchMode(mode) {
    if (this.isCapturing) {
      this.stopAllCaptures();
    }

    this.activeMode = mode;

    // Update origin dropdown trigger & active item
    const originMap = {
      'usb': { icon: '🔌', text: '1. USB OTG' },
      'wifi': { icon: '📡', text: '2. Wi-Fi Bridge' },
      'touchless': { icon: '📷', text: '3. Touchless' }
    };
    if (originMap[mode]) {
      if (this.dom.originIcon) this.dom.originIcon.textContent = originMap[mode].icon;
      if (this.dom.originText) this.dom.originText.textContent = originMap[mode].text;
    }
    this.dom.originItems?.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-mode') === mode);
    });

    // Reset touchless specific UI
    this.dom.touchlessParamsBar.classList.toggle('active', mode === 'touchless');
    this.dom.touchlessReticle.classList.toggle('active', mode === 'touchless');
    this.dom.scannerVideo.style.display = 'none';

    // USB Dynamic Controls Bar visibility
    if (this.dom.usbControlsBar) {
      this.dom.usbControlsBar.style.display = (mode === 'usb') ? 'flex' : 'none';
    }

    // Hide the 4 Biometric Scanner modalities dropdown when Touchless is active, show on USB / Wi-Fi
    if (this.dom.dropdownModality) {
      this.dom.dropdownModality.style.display = (mode === 'touchless') ? 'none' : 'block';
    }

    if (mode === 'usb') {
      this.setStatus('active', 'Modo USB OTG seleccionado.');
      this.updateCaptureButton(false, 'INICIAR CAPTURA');
    } else if (mode === 'wifi') {
      this.setStatus('active', 'Modo Wi-Fi RealScan PC seleccionado.');
      this.updateCaptureButton(false, 'INICIAR CAPTURA');
    } else if (mode === 'touchless') {
      this.setStatus('active', 'Modo Touchless: Presione ACTIVAR CÁMARA para enfocar.');
      this.updateCaptureButton(false, 'ACTIVAR CÁMARA');
    }
  }

  setCaptureType(type) {
    this.currentCaptureType = type;

    // Update modality dropdown trigger & active item
    const typeMeta = {
      'ROLLED': { icon: '🌀', text: 'Huella Rodada (1-10)' },
      'FLAT_SINGLE': { icon: '👆', text: 'Plana Individual' },
      'SLAP_3_4': { icon: '🖐', text: 'Simultáneas 3/4' },
      'DUAL_THUMBS': { icon: '👍👍', text: 'Dos Pulgares' }
    };

    if (typeMeta[type]) {
      if (this.dom.modalityIcon) this.dom.modalityIcon.textContent = typeMeta[type].icon;
      if (this.dom.modalityText) this.dom.modalityText.textContent = typeMeta[type].text;
    }

    this.dom.modalityItems?.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-type') === type);
    });

    const typeLabels = {
      'ROLLED': 'Huella Rodada (1 al 10)',
      'FLAT_SINGLE': 'Plana Individual',
      'SLAP_3_4': 'Simultáneas Índice-Medio-Anular',
      'DUAL_THUMBS': 'Dos Pulgares Simultáneos'
    };
    const label = typeLabels[type] || type;

    // Sync save modal dropdown
    if (this.dom.inputCaptureTypeSelect) {
      this.dom.inputCaptureTypeSelect.value = label;
    }

    // Dynamic Reticle adjustment for touchless / live view
    if (type === 'SLAP_3_4') {
      this.dom.touchlessReticle.style.width = '280px';
      this.dom.touchlessReticle.style.height = '240px';
      this.dom.touchlessReticle.style.borderRadius = '32px';
      this.dom.reticleLabel.textContent = 'ALINEAR 3 O 4 DEDOS';
    } else if (type === 'DUAL_THUMBS') {
      this.dom.touchlessReticle.style.width = '260px';
      this.dom.touchlessReticle.style.height = '260px';
      this.dom.touchlessReticle.style.borderRadius = '40px';
      this.dom.reticleLabel.textContent = 'ALINEAR DOS PULGARES';
    } else if (type === 'ROLLED') {
      this.dom.touchlessReticle.style.width = '250px';
      this.dom.touchlessReticle.style.height = '320px';
      this.dom.touchlessReticle.style.borderRadius = '110px 110px 80px 80px';
      this.dom.reticleLabel.textContent = 'RODAR DE UÑA A UÑA';
    } else {
      this.dom.touchlessReticle.style.width = '220px';
      this.dom.touchlessReticle.style.height = '300px';
      this.dom.touchlessReticle.style.borderRadius = '120px 120px 90px 90px';
      this.dom.reticleLabel.textContent = 'ALINEAR DEDO PLANO';
    }

    if (navigator.vibrate) navigator.vibrate(30);
    this.showToast(`Modo: ${label}`);
  }

  async toggleUsbConnection() {
    if (this.usbScanner.isConnected) {
      await this.usbScanner.disconnect();
      this.showToast('Lector USB desconectado.');
    } else {
      this.showToast('Conectando lector USB...');
      try {
        const dev = await this.usbScanner.connect();
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        const devTitle = dev?.productName || 'Biométrico';
        this.showToast(`🟢 Lector ${devTitle} conectado y sincronizado.`);
      } catch (err) {
        if (err && err.message) {
          this.showToast(err.message, 4000);
        }
      }
    }
  }

  async toggleCapture() {
    if (this.activeMode === 'touchless') {
      // If camera is currently active, clicking the button TAKES THE SHOT manually!
      if (this.touchlessCam.isActive) {
        this.touchlessCam.captureSnapshot();
        return;
      } else {
        // If camera is off, clicking the button starts the live preview
        this.dom.scannerVideo.style.display = 'block';
        this.dom.touchlessReticle.classList.add('active');
        this.isCapturing = true;
        this.updateCaptureButton(true, '📸 TOMAR FOTO (DISPARAR)');
        await this.touchlessCam.start();
        this.dom.btnToggleFlash.classList.toggle('active', !!this.touchlessCam.isTorchOn);
        return;
      }
    }

    if (this.isCapturing) {
      this.stopAllCaptures();
      this.updateCaptureButton(false);
    } else {
      this.isCapturing = true;
      this.updateCaptureButton(true);

      if (this.activeMode === 'usb') {
        try {
          if (!this.usbScanner.isConnected) {
            await this.usbScanner.connect();
          }
          await this.usbScanner.startCapture(this.currentCaptureType);
        } catch (e) {
          console.error('USB capture error:', e);
          this.showToast(e.message || 'Error al capturar huella USB.', 5000);
        } finally {
          this.isCapturing = false;
          this.updateCaptureButton(false);
        }
      } else if (this.activeMode === 'wifi') {
        try {
          if (!this.wifiBridge.isConnected) {
            await this.wifiBridge.connect();
          }
          this.wifiBridge.startCapture(this.currentCaptureType);
        } catch (e) {
          this.isCapturing = false;
          this.updateCaptureButton(false);
        }
      }
    }
  }

  stopAllCaptures() {
    this.isCapturing = false;
    this.usbScanner.stopCapture();
    this.wifiBridge.stopCapture();
    this.touchlessCam.stop();
    this.dom.btnToggleFlash.classList.remove('active');
    this.dom.scannerVideo.style.display = 'none';
    this.dom.touchlessReticle.classList.remove('active');
    const defaultLabel = this.activeMode === 'touchless' ? 'ACTIVAR CÁMARA' : 'INICIAR CAPTURA';
    this.updateCaptureButton(false, defaultLabel);
  }

  updateCaptureButton(isRecording, customLabel = null) {
    this.dom.btnMainCapture.classList.toggle('recording', isRecording);
    if (customLabel) {
      this.dom.captureBtnLabel.textContent = customLabel;
    } else {
      this.dom.captureBtnLabel.textContent = isRecording ? 'DETENER CAPTURA' : 'INICIAR CAPTURA';
    }
  }

  handleStatusChange(source, info) {
    if (info.message) {
      this.dom.statusText.textContent = info.message;
    }

    if (info.state === 'connected' || info.state === 'captured' || info.state === 'ready') {
      this.dom.statusDot.className = 'status-dot active';
    } else if (info.state === 'capturing' || info.state === 'steady') {
      this.dom.statusDot.className = 'status-dot warning';
    } else if (info.state === 'error' || info.state === 'disconnected') {
      this.dom.statusDot.className = 'status-dot danger';
    }

    // USB Dynamic visual feedback
    if (source === 'USB') {
      if (info.state === 'connected') {
        this.dom.btnConnectUsb?.classList.add('connected');
        if (this.dom.usbConnectIcon) this.dom.usbConnectIcon.textContent = '🟢';
        if (this.dom.usbConnectLabel) {
          const devTitle = info.deviceName ? info.deviceName.toUpperCase() : 'BIOMÉTRICO';
          this.dom.usbConnectLabel.textContent = `${devTitle} CONECTADO`;
        }
        if (this.dom.usbStatusBadge) {
          this.dom.usbStatusBadge.textContent = 'En Línea';
          this.dom.usbStatusBadge.className = 'usb-badge connected';
        }
        if (this.dom.usbActionsSecondary) {
          this.dom.usbActionsSecondary.style.display = 'flex';
          const isZK = info.deviceName && /zk|biokey/i.test(info.deviceName);
          if (this.dom.usbLightLabel) {
            this.dom.usbLightLabel.textContent = isZK ? '🔴 ENCENDER LUZ ROJA' : '💡 ACTIVAR LUZ PRISMA';
          }
        }
      } else if (info.state === 'disconnected' || info.state === 'error') {
        this.dom.btnConnectUsb?.classList.remove('connected');
        if (this.dom.usbConnectIcon) this.dom.usbConnectIcon.textContent = '🔌';
        if (this.dom.usbConnectLabel) {
          this.dom.usbConnectLabel.textContent = 'CONECTAR LECTOR USB';
        }
        if (this.dom.usbStatusBadge) {
          this.dom.usbStatusBadge.textContent = (info.state === 'error' ? 'Error' : 'Desconectado');
          this.dom.usbStatusBadge.className = 'usb-badge disconnected';
        }
        if (this.dom.usbActionsSecondary) {
          this.dom.usbActionsSecondary.style.display = 'none';
        }
        this.dom.btnToggleUsbLight?.classList.remove('active');
        if (this.dom.usbLightIcon) this.dom.usbLightIcon.textContent = '💡';
        if (this.dom.usbLightLabel) this.dom.usbLightLabel.textContent = 'ACTIVAR LUZ DEL PRISMA / SENSOR';
      } else if (info.state === 'requesting') {
        if (this.dom.usbConnectIcon) this.dom.usbConnectIcon.textContent = '⏳';
        if (this.dom.usbConnectLabel) {
          this.dom.usbConnectLabel.textContent = 'SELECCIONE SU LECTOR USB...';
        }
        if (this.dom.usbStatusBadge) {
          this.dom.usbStatusBadge.textContent = 'Vinculando';
          this.dom.usbStatusBadge.className = 'usb-badge warning';
        }
      }
    }

    // Touchless Reticle visual feedback
    if (source === 'Touchless') {
      if (info.state === 'steady') {
        this.dom.touchlessReticle.classList.add('locked');
        this.dom.reticleLabel.textContent = `ESTABLE: ${Math.round(info.stability)}%`;
      } else if (info.state === 'moving') {
        this.dom.touchlessReticle.classList.remove('locked');
        this.dom.reticleLabel.textContent = 'MANTENGA FIJO EL DEDO';
      }
    }
  }

  /**
   * Process incoming fingerprint frame from any of the 3 capture sources
   */
  handleIncomingFrame(canvas) {
    this.currentRawCanvas = canvas;

    // Run Forensic Analytical Pipeline
    const result = this.processor.process(canvas);
    this.currentForensicResult = result;

    // Update HUD
    this.updateHUD(result);

    // Render active layer
    this.renderCurrentLayer();

    if (navigator.vibrate) navigator.vibrate(60);
    this.stopAllCaptures();
    if (this.activeMode === 'touchless') {
      this.updateCaptureButton(false, '🔄 REPETIR / NUEVA TOMA');
    }
    this.showToast('Huella adquirida y analizada.');
  }

  updateHUD(result) {
    const nfiq = result.nfiq;
    this.dom.hudNfiq.textContent = `NFIQ ${nfiq.nfiqLevel} (${nfiq.label})`;
    this.dom.hudNfiq.className = `nfiq-badge nfiq-${nfiq.nfiqLevel}`;

    const mCount = result.minutiae.length;
    this.dom.hudMinutiaeCount.textContent = `${mCount} Minucias`;
  }

  setLayer(layer) {
    this.activeLayer = layer;
    this.dom.layerBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-layer') === layer);
    });
    this.renderCurrentLayer();
  }

  renderCurrentLayer() {
    if (!this.currentForensicResult || !this.currentRawCanvas) return;

    const res = this.currentForensicResult;
    const ctx = this.dom.mainCanvas.getContext('2d');
    const oCtx = this.dom.overlayCanvas.getContext('2d');
    const w = this.dom.mainCanvas.width;
    const h = this.dom.mainCanvas.height;

    ctx.clearRect(0, 0, w, h);
    oCtx.clearRect(0, 0, w, h);

    if (this.activeLayer === 'raw') {
      ctx.drawImage(this.currentRawCanvas, 0, 0, w, h);
    } else if (this.activeLayer === 'binary') {
      const imgData = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const val = res.binary[i] === 1 ? 0 : 255;
        const idx = i * 4;
        imgData.data[idx] = val;
        imgData.data[idx + 1] = val;
        imgData.data[idx + 2] = val;
        imgData.data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (this.activeLayer === 'skeleton') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const imgData = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const isRidge = res.skeleton[i] === 1;
        const idx = i * 4;
        imgData.data[idx] = isRidge ? 20 : 245;
        imgData.data[idx + 1] = isRidge ? 20 : 245;
        imgData.data[idx + 2] = isRidge ? 20 : 245;
        imgData.data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (this.activeLayer === 'minutiae') {
      // Draw skeleton as backdrop
      ctx.fillStyle = '#0a101d';
      ctx.fillRect(0, 0, w, h);
      const imgData = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const isRidge = res.skeleton[i] === 1;
        const idx = i * 4;
        if (isRidge) {
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 180;
          imgData.data[idx + 2] = 220;
          imgData.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Draw Minutiae overlay markers
      for (const m of res.minutiae) {
        oCtx.save();
        if (m.type === 'bifurcation') {
          // Cyan square
          oCtx.strokeStyle = '#00e5ff';
          oCtx.fillStyle = 'rgba(0, 229, 255, 0.3)';
          oCtx.lineWidth = 1.8;
          oCtx.beginPath();
          oCtx.rect(m.x - 4, m.y - 4, 8, 8);
          oCtx.fill();
          oCtx.stroke();
        } else {
          // Red / Pink circle (termination)
          oCtx.strokeStyle = '#ff3366';
          oCtx.fillStyle = 'rgba(255, 51, 102, 0.3)';
          oCtx.lineWidth = 1.8;
          oCtx.beginPath();
          oCtx.arc(m.x, m.y, 4, 0, Math.PI * 2);
          oCtx.fill();
          oCtx.stroke();
        }

        // Direction tail
        oCtx.strokeStyle = '#ffb700';
        oCtx.lineWidth = 1.4;
        oCtx.beginPath();
        oCtx.moveTo(m.x, m.y);
        oCtx.lineTo(m.x + Math.cos(m.angle) * 10, m.y + Math.sin(m.angle) * 10);
        oCtx.stroke();
        oCtx.restore();
      }
    }
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('livescan_theme', theme);

    // Update browser status bar color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#f8fafc' : '#070a10');
    }

    if (this.dom.iconThemeSun && this.dom.iconThemeMoon) {
      if (theme === 'light') {
        this.dom.iconThemeSun.style.display = 'block';
        this.dom.iconThemeMoon.style.display = 'none';
        this.dom.btnThemeToggle.setAttribute('title', 'Cambiar a Modo Noche');
      } else {
        this.dom.iconThemeSun.style.display = 'none';
        this.dom.iconThemeMoon.style.display = 'block';
        this.dom.btnThemeToggle.setAttribute('title', 'Cambiar a Modo Día');
      }
    }

    // Re-render placeholder or active layer for correct background
    if (!this.currentRawCanvas) {
      this.drawInitialPlaceholder();
    } else {
      this.renderCurrentLayer();
    }
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
    if (navigator.vibrate) navigator.vibrate(30);
    this.showToast(newTheme === 'light' ? '☀️ Modo Día Activado' : '🌙 Modo Noche Activado');
  }

  drawInitialPlaceholder() {
    const ctx = this.dom.mainCanvas.getContext('2d');
    const w = this.dom.mainCanvas.width;
    const h = this.dom.mainCanvas.height;

    const isLight = document.body.getAttribute('data-theme') === 'light';

    ctx.fillStyle = isLight ? '#f8fafc' : '#060a12';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.35)' : 'rgba(0, 229, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 70, 110, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isLight ? '#0284c7' : 'rgba(0, 229, 255, 0.4)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DISPOSITIVO LISTO', w / 2, h / 2 - 8);
    ctx.fillStyle = isLight ? '#64748b' : 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px monospace';
    ctx.fillText('SELECCIONE MODO Y PRESIONE CAPTURA', w / 2, h / 2 + 12);
  }

  /* ==========================================================================
     1:1 Neon Cotejo / Verification AFIS
     ========================================================================== */
  loadProbeForMatch(rawCanvas, forensicResult) {
    this.probeResult = forensicResult;
    this.currentProbeCanvas = rawCanvas;
    const pCtx = this.dom.matchProbeCanvas.getContext('2d');
    pCtx.clearRect(0, 0, 240, 320);
    pCtx.drawImage(rawCanvas, 0, 0, 240, 320);
  }

  loadReferenceForMatch(rawCanvasOrUrl, minutiaeList) {
    if (typeof rawCanvasOrUrl === 'string') {
      const img = new Image();
      img.onload = () => {
        this.currentRefCanvasOrImg = img;
        const rCtx = this.dom.matchRefCanvas.getContext('2d');
        rCtx.clearRect(0, 0, 240, 320);
        rCtx.drawImage(img, 0, 0, 240, 320);
      };
      img.src = rawCanvasOrUrl;
    } else {
      this.currentRefCanvasOrImg = rawCanvasOrUrl;
      const rCtx = this.dom.matchRefCanvas.getContext('2d');
      rCtx.clearRect(0, 0, 240, 320);
      rCtx.drawImage(rawCanvasOrUrl, 0, 0, 240, 320);
    }
    this.refResult = { minutiae: minutiaeList };
  }

  async execute1to1Match() {
    if (!this.probeResult || !this.probeResult.minutiae || this.probeResult.minutiae.length === 0) {
      this.showToast('Primero capture o asigne la huella Evidencia (Probe).');
      return;
    }

    // Reference must be a genuine record loaded from database or file
    if (!this.refResult || !this.refResult.minutiae || this.refResult.minutiae.length === 0) {
      const records = await forensicDB.getAllRecords();
      if (records && records.length > 0) {
        this.switchTab('tabDatabase');
        this.showToast('Seleccione un registro de control en la Base de Datos para cotejar.');
      } else {
        this.showToast('Guarde registros en la Base de Datos para utilizarlos como Referencia.');
      }
      return;
    }

    // Clean canvases prior to running match visualization
    if (this.currentProbeCanvas) {
      const pCtx = this.dom.matchProbeCanvas.getContext('2d');
      pCtx.clearRect(0, 0, 240, 320);
      pCtx.drawImage(this.currentProbeCanvas, 0, 0, 240, 320);
    }
    if (this.currentRefCanvasOrImg) {
      const rCtx = this.dom.matchRefCanvas.getContext('2d');
      rCtx.clearRect(0, 0, 240, 320);
      rCtx.drawImage(this.currentRefCanvasOrImg, 0, 0, 240, 320);
    }

    // Start Neon Laser Sweep Animation
    this.dom.neonLaserSweep.classList.add('running');
    this.dom.matchVerdictBanner.className = 'verdict-banner analyzing';
    this.dom.matchVerdictBanner.textContent = 'ANALIZANDO CRESTAS PAPILARES DACTILOSCÓPICAS...';

    // Sound / Haptic pulses
    if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50]);

    setTimeout(() => {
      const matchResult = this.matcher.match(this.probeResult.minutiae, this.refResult.minutiae);
      this.dom.neonLaserSweep.classList.remove('running');

      // Update Radial Score
      const circumference = 339.292;
      const offset = circumference - (matchResult.percentage / 100) * circumference;
      this.dom.radialScoreIndicator.style.strokeDashoffset = offset;
      this.dom.radialScoreIndicator.style.stroke = matchResult.isMatch ? 'var(--accent-green)' : 'var(--accent-red)';
      this.dom.matchPercentage.textContent = `${matchResult.percentage}%`;

      // Verdict Banner
      this.dom.matchVerdictBanner.className = `verdict-banner ${matchResult.isMatch ? 'match' : 'non-match'}`;
      this.dom.matchVerdictBanner.textContent = matchResult.verdict;

      // Stats
      this.dom.statMatchedPoints.textContent = `${matchResult.score} pts`;
      this.dom.statRotation.textContent = `${matchResult.rotation}°`;
      this.dom.statDecision.textContent = matchResult.isMatch ? 'POSITIVO' : 'NEGATIVO';

      // Render glowing neon connector nodes
      this.matcher.renderNeonMatchVisualization(
        this.dom.matchProbeCanvas,
        this.dom.matchRefCanvas,
        matchResult.matchedPairs
      );

      if (matchResult.isMatch) {
        if (navigator.vibrate) navigator.vibrate([80, 100, 150]);
        this.showToast(`¡COINCIDENCIA IDENTIFICADA! (${matchResult.score} puntos)`);
      } else {
        if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
        this.showToast(`Cotejo completado: ${matchResult.score} puntos homólogos.`);
      }
    }, 1500);
  }

  /* ==========================================================================
     Database Management
     ========================================================================== */
  async saveCurrentRecord() {
    if (!this.currentForensicResult || !this.currentRawCanvas) return;

    const fullName = this.dom.inputFullName.value.trim() || 'Desconocido';
    const docId = this.dom.inputDocId.value.trim() || 'S/N';
    const captureType = this.dom.inputCaptureTypeSelect ? this.dom.inputCaptureTypeSelect.value : 'Huella Rodada (1 al 10)';
    const finger = this.dom.inputFingerSelect.value;
    const caseNumber = this.dom.inputCaseNumber.value.trim() || 'EXP-ACTUAL';
    const officer = this.dom.inputOfficer.value.trim() || 'Perito Forense Jorge PINO A. / Bicrim San Javier.';

    const rawDataUrl = this.currentRawCanvas.toDataURL('image/jpeg', 0.85);

    const record = {
      fullName,
      docId,
      captureType,
      finger,
      caseNumber,
      officer,
      source: this.activeMode.toUpperCase(),
      nfiqScore: this.currentForensicResult.nfiq.nfiqLevel,
      nfiqLabel: this.currentForensicResult.nfiq.label,
      minutiae: this.currentForensicResult.minutiae,
      rawImage: rawDataUrl
    };

    try {
      const id = await forensicDB.addRecord(record);
      this.dom.saveRecordModal.classList.remove('active');
      this.showToast(`Ficha guardada con éxito (ID #${id}).`);
      this.renderDatabaseList();
    } catch (e) {
      this.showToast('Error guardando en la base de datos.');
    }
  }

  async renderDatabaseList(searchQuery = '') {
    const records = await forensicDB.searchRecords(searchQuery);
    const list = this.dom.recordsList;
    list.innerHTML = '';

    if (records.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px;">
          No hay registros dactiloscópicos guardados.
        </div>
      `;
      return;
    }

    records.forEach(r => {
      const card = document.createElement('div');
      card.className = 'record-card';
      card.innerHTML = `
        <img class="record-thumb" src="${r.rawImage || ''}" alt="Huella">
        <div class="record-info">
          <div class="record-name">${r.fullName} (${r.docId})</div>
          <div class="record-meta">${r.captureType || 'Huella'} • ${r.finger} • Causa: ${r.caseNumber}</div>
          <div class="record-meta" style="color: var(--accent-cyan);">
            NFIQ ${r.nfiqScore} • ${r.minutiae ? r.minutiae.length : 0} Minucias • ${r.source}
          </div>
        </div>
        <div class="record-actions">
          <button class="btn-secondary btn-load-ref" style="padding: 5px 8px; font-size: 10px;" data-id="${r.id}">
            Cotejar
          </button>
          <button class="btn-secondary btn-del-rec" style="padding: 5px 8px; font-size: 10px; color: var(--accent-red);" data-id="${r.id}">
            Borrar
          </button>
        </div>
      `;

      card.querySelector('.btn-load-ref').addEventListener('click', (e) => {
        e.stopPropagation();
        this.loadReferenceForMatch(r.rawImage, r.minutiae);
        this.switchTab('tabMatch');
        this.showToast(`Referencia cargada: ${r.fullName}`);
      });

      card.querySelector('.btn-del-rec').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`¿Eliminar ficha de ${r.fullName}?`)) {
          await forensicDB.deleteRecord(r.id);
          this.renderDatabaseList(this.dom.dbSearchInput.value);
          this.showToast('Registro eliminado.');
        }
      });

      list.appendChild(card);
    });
  }

  setStatus(type, msg) {
    this.dom.statusText.textContent = msg;
    this.dom.statusDot.className = `status-dot ${type}`;
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>${msg}</span>
    `;
    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('Service Worker registration skipped or failed:', err);
      });
    }
  }
}

// Instantiate on DOM load or immediately if already loaded (fixes mobile ES module deferred freeze)
const initLiveScanApp = () => {
  if (window.liveScanApp) return;
  try {
    window.liveScanApp = new LiveScanApp();
    console.log('[LiveScan] Aplicación inicializada con éxito.');
  } catch (err) {
    console.error('[LiveScan] Error crítico de inicialización:', err);
    var errBox = document.getElementById('debugErrorBanner');
    if (!errBox) {
      errBox = document.createElement('div');
      errBox.id = 'debugErrorBanner';
      errBox.style = 'position:fixed;bottom:62px;left:8px;right:8px;background:rgba(220,38,38,0.95);color:#fff;padding:10px 12px;border-radius:8px;font-size:11px;z-index:99999;font-family:monospace;border:1px solid #ff4444;box-shadow:0 4px 20px rgba(0,0,0,0.8);';
      document.body.appendChild(errBox);
    }
    errBox.innerHTML = '<strong>❌ Error de Inicio:</strong> ' + (err.message || err);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiveScanApp);
  window.addEventListener('load', initLiveScanApp);
} else {
  // Document is already interactive or complete
  initLiveScanApp();
}
