# LiveScan Mobile Forensic (PWA Móvil) 📱🔍

**LiveScan Mobile Forensic** es una aplicación web progresiva (PWA) de nivel pericial y forense diseñada y optimizada para teléfonos inteligentes (smartphones). Proporciona un visor vertical táctico responsivo en tema oscuro OLED con retroalimentación háptica, 3 modalidades avanzadas de adquisición dactiloscópica, motor de extracción de minucias, cálculo de calidad biométrica NFIQ, cotejo 1:1 con animación de escáner de luz neón y base de datos local cifrada offline-first (IndexedDB).

---

## 🌟 Características Principales

### 1. Las 3 Opciones de Captura Dactiloscópica
* **Opción 1: Conexión directa USB OTG (WebUSB / Android)**
  * Permite conectar lectores biométricos ópticos/capacitivos mediante cable USB OTG directamente al puerto USB-C del teléfono.
  * Soporta dispositivos Suprema (BioMini, RealScan), DigitalPersona (U.are.U), SecuGen, Futronic y Crossmatch.
  * Incluye fallback automático a simulador de sensor óptico para pruebas en campo sin hardware físico conectado.
* **Opción 2: Conexión remota por Wi-Fi hacia RealScan Bridge de la PC**
  * Protocolo WebSocket de baja latencia para conectarse a una PC forense de escritorio donde esté instalado un escáner decadactilar (ej. Suprema RealScan-G10, RealScan-F).
  * Incluye scripts de servidor listos para usar en **Python** (`bridge/pc_realscan_bridge.py`) y **Node.js** (`bridge/pc_bridge.js`).
* **Opción 3: Captura Touchless (Cámara Macro del Celular con Flash LED)**
  * Captura dactilar sin contacto (Touchless Dactyloscopy) utilizando la cámara trasera con lente macro y activación forzada de la linterna (*torch/flash*).
  * Algoritmo de supresión de brillo especular dérmico y filtrado Laplaciano de alta frecuencia para aislar las crestas papilares.
  * Retícula de puntería oval con detector de estabilidad: cuando el dedo permanece quieto dentro de la guía durante unos instantes, dispara automáticamente la toma con vibración háptica.

---

### 2. Visor Vertical Responsivo y Capas Forenses
Visor vertical en proporción 3:4 adaptado a pantallas móviles, con visualización de 5 capas conmutables en tiempo real:
1. **ORIGINAL**: Imagen adquirida en escala de grises con ecualización de contraste local.
2. **REALZADO**: Binarización adaptativa local tipo Sauvola con preservación de valles.
3. **ESQUELETO**: Adelgazamiento morfológico iterativo de 1 píxel de grosor mediante el algoritmo **Zhang-Suen**.
4. **MINUCIAS**: Detección estandarizada por Número de Cruce (*Crossing Number - CN*):
   - 🔴 **Terminaciones de cresta (CN = 1)**: Marcadas con círculos magenta/rojos y cola de dirección $\theta$.
   - 🔷 **Bifurcaciones de cresta (CN = 3)**: Marcadas con cuadrantes cian neón.
   - Poda automática de falsas minucias en bordes y ruidos por puentes.
5. **FLUJO**: Visualización vectorial de las orientaciones del campo de crestas mediante tensores de gradiente de Sobel en bloques de 10x10.

---

### 3. Estimador de Calidad NFIQ (NIST 1 a 5)
Calcula el índice de calidad forense estandarizado:
* **NFIQ 1 (Excelente - Verde neón)**: Coherencia direccional $\ge 80\%$, alto contraste de crestas, densidad óptima de minucias.
* **NFIQ 2 (Muy Buena - Cian neón)**: Buena calidad biométrica apta para enrolamiento y AFIS civil/criminal.
* **NFIQ 3 (Buena - Ámbar)**: Calidad media aceptable para verificación 1:1.
* **NFIQ 4 (Marginal - Naranja)**: Calidad degradada, huella con presión excesiva o resequedad.
* **NFIQ 5 (Pobre / Rechazo - Rojo)**: Huella borrosa, sin contraste suficiente o fuera de foco.

---

### 4. Cotejo 1:1 con Animación de Luz Neón (Neon AFIS Matcher)
* Alineación por hipótesis afín invariante ante rotación ($\Delta\theta$) y traslación ($\Delta x, \Delta y$).
* **Barrido de Luz Neón**: Al presionar *"Ejecutar Cotejo 1:1"*, una línea de láser neón recorre verticalmente ambos visores con vibraciones táctiles.
* **Trazado de Nodos Neón**: Los pares de minucias coincidentes se iluminan con anillos cian y esferas verdes conectadas por vectores forenses.
* **Dictamen Pericial**:
  * Indicador radial de porcentaje de similitud ($0\%$ a $100\%$).
  * Conclusión: `COINCIDENCIA PLENA (IDENTIDAD CONFIRMADA)` ($\ge 16$ puntos), `COINCIDENCIA POSITIVA` ($\ge 12$ puntos / $\ge 70\%$) o `NO COINCIDE (NEGATIVO)`.

---

### 5. Base de Datos Local (IndexedDB Offline-First)
* Almacena fichas dactilares con: Nombre y apellido, DNI/Identificación, Dedo capturado (Pulgar, Índice, etc.), Causa judicial, Perito actuante, Minucias en formato JSON ISO-compatible y fotografía raw/procesada.
* Búsqueda instantánea en tiempo real.
* Botón directo *"Cotejar"* para cargar cualquier registro histórico como plantilla de referencia de control.
* Exportación y restauración de copias de seguridad completas en formato `.json`.

---

## 🚀 Guía de Instalación y Uso

### Paso 1: Servir la aplicación web
Debido a que las APIs móviles modernas (**WebUSB**, **Cámara trasera con Flash** y **Service Workers**) requieren un contexto seguro (`HTTPS` o `localhost`), inicie un servidor local:

```bash
# Opción con Python:
cd C:\Users\jpinoa\.gemini\antigravity\scratch\livescan-mobile-forensic
python -m http.server 8000

# Opción con Node.js / npx serve:
npx serve -l 8000
```

> **Para probar en el teléfono móvil:**
> Conecte el teléfono a la misma red Wi-Fi y acceda a `http://<IP-DE-SU-PC>:8000` o use un túnel seguro como [Cloudflare Tunnel](https://developers.cloudflare.com/pages/) o [ngrok](https://ngrok.com/):
> ```bash
> ngrok http 8000
> ```
> Abra la URL `https://xxxx.ngrok-free.app` en Google Chrome en su teléfono Android.

---

### Paso 2: Instalar en la pantalla de inicio (PWA)
1. En Google Chrome para Android, toque el menú de tres puntos (⋮).
2. Seleccione **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
3. La aplicación se ejecutará a pantalla completa en modo nativo (*standalone*), con orientación vertical bloqueada y soporte 100% offline.

---

### Paso 3: Uso de las 3 opciones de captura

#### Opción 1: USB OTG (WebUSB)
1. Conecte su lector de huellas (Suprema BioMini, RealScan, DigitalPersona) al celular usando un adaptador USB-C a USB-A OTG.
2. En la barra superior de modos, seleccione **"1. USB OTG"**.
3. Presione **"INICIAR CAPTURA"**. El navegador solicitará permiso para acceder al dispositivo USB. Seleccione su lector y acepte.
*(Si no tiene un lector USB conectado en ese momento, la app activará automáticamente el generador biométrico procedural para permitir pruebas completas).*

#### Opción 2: Wi-Fi Bridge (Suprema RealScan en PC)
1. En la computadora forense donde tiene conectado el escáner grande RealScan, inicie el servidor de enlace:
   ```bash
   # En Python:
   cd bridge
   pip install websockets pillow
   python pc_realscan_bridge.py --port 8080

   # O en Node.js:
   cd bridge
   npm install
   npm start
   ```
2. En el teléfono móvil, toque el ícono de engranaje superior en la barra de la PWA.
3. Ingrese la dirección IP local de su PC (ejemplo: `ws://192.168.1.100:8080/ws`) y guarde.
4. Seleccione **"2. Wi-Fi Bridge"** y presione **"INICIAR CAPTURA"**. La huella plana de 500 DPI será transferida instantáneamente por Wi-Fi.

#### Opción 3: Touchless Macro con Flash LED
1. Seleccione **"3. Touchless"** y toque **"INICIAR CAPTURA"**.
2. Conceda permiso de cámara. La linterna trasera se encenderá automáticamente para iluminar las crestas.
3. Ubique la yema del dedo dentro de la retícula guía oval a una distancia aproximada de 6 a 10 cm.
4. Ajuste el control deslizante de **Macro** si es necesario.
5. El sistema evaluará la estabilidad en tiempo real (`ESTABLE: xx%`). Al mantener el dedo quieto, la PWA tomará la foto, aplicará el filtro dérmico y extraerá las minucias automáticamente.

---

### Paso 4: Cotejo 1:1 con Luz Neón
1. Tras capturar una huella en la pestaña **Captura**, presione el botón de doble círculo **"Enviar a Cotejo 1:1"**.
2. Pase a la pestaña **Cotejo 1:1**. La huella capturada aparecerá en el visor izquierdo (*Evidencia / Probe*).
3. Toque *"Cargar Referencia BD"* para elegir un sospechoso o huella testigo guardada previamente, o presione *"Ejecutar Cotejo 1:1 con Luz Neón"*.
4. Observe el barrido del haz de luz neón, el cálculo del porcentaje de similitud y los puntos coincidentes enlazados con brillo neón.

---

## 📂 Estructura del Proyecto

```
livescan-mobile-forensic/
├── index.html                   # Interfaz PWA vertical responsiva táctica
├── manifest.json                # Manifiesto PWA para instalación móvil
├── sw.js                        # Service Worker para caché y funcionamiento offline
├── css/
│   └── app.css                  # Tema oscuro OLED, efectos neón, HUD forense
├── js/
│   ├── app.js                   # Orquestador principal de UI, eventos y estados
│   └── modules/
│       ├── db.js                # Base de datos IndexedDB pericial offline
│       ├── forensic_processor.js# Extractor de minucias (Zhang-Suen, Sobel, NFIQ)
│       ├── afis_matcher.js      # Motor de cotejo 1:1 y animación de haz neón
│       ├── otg_usb.js           # Controlador WebUSB OTG (Suprema, DigitalPersona)
│       ├── wifi_bridge.js       # Cliente WebSocket para PC RealScan Bridge
│       └── touchless_camera.js  # Cámara macro, linterna LED y filtro dérmico
├── bridge/
│   ├── pc_realscan_bridge.py    # Servidor Bridge WebSocket en Python para PC
│   ├── pc_bridge.js             # Servidor Bridge WebSocket en Node.js para PC
│   └── package.json             # Dependencias Node.js
└── README.md                    # Documentación técnica completa
```

---

## 🔒 Privacidad y Seguridad Forense
* Todos los datos biométricos, imágenes de crestas y coordenadas de minucias se procesan de forma estrictamente local en el navegador mediante JavaScript y WebGL/Canvas sin enviar datos a la nube externa.
* La base de datos local reside en el almacenamiento aislado IndexedDB del dispositivo pericial.
