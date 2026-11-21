"""
LiveScan Mobile Forensic - Servidor Puente ZKTeco (ZK7500 / ZK4500 / ZK7000)
Perito Forense Jorge PINO A. / Bicrim San Javier
=============================================================================
Este script conecta tu lector biométrico ZKTeco por USB a la PC y transmite
las huellas en tiempo real vía WebSocket a la PWA LiveScan Mobile Forensic.
"""

import sys
import os
import io
import time
import base64
import json
import asyncio
import threading
from PIL import Image, ImageDraw

# Intentar importar websockets
try:
    import websockets
except ImportError:
    print("\n[!] Falta la librería 'websockets'. Instalando automáticamente...")
    os.system(f'"{sys.executable}" -m pip install websockets pillow')
    import websockets

# Intentar importar pyzkfp para comunicación nativa con ZKTeco
ZK_HARDWARE_AVAILABLE = False
try:
    from pyzkfp import ZKFP2
    ZK_HARDWARE_AVAILABLE = True
except ImportError:
    print("[i] 'pyzkfp' no está instalado aún. El puente iniciará en modo Híbrido.")

PORT = 8080
CLIENTS = set()
CAPTURE_ACTIVE = False
CURRENT_MODE = "ROLLED"

class ZKScannerController:
    def __init__(self):
        self.zkfp2 = None
        self.device_opened = False
        self.width = 288
        self.height = 375
        self.init_hardware()

    def init_hardware(self):
        global ZK_HARDWARE_AVAILABLE
        if not ZK_HARDWARE_AVAILABLE:
            return False
        try:
            self.zkfp2 = ZKFP2()
            res = self.zkfp2.Init()
            count = self.zkfp2.GetDeviceCount()
            print(f"[*] ZKTeco SDK inicializado. Dispositivos detectados: {count}")
            if count > 0:
                self.zkfp2.OpenDevice(0)
                self.device_opened = True
                if hasattr(self.zkfp2, 'width') and self.zkfp2.width > 0:
                    self.width = self.zkfp2.width
                    self.height = self.zkfp2.height
                print(f"[✓] Lector ZKTeco CONECTADO y LISTO ({self.width}x{self.height} px @ 500 DPI).")
                return True
            else:
                print("[!] No se detectó escáner ZKTeco conectado por USB.")
                return False
        except Exception as e:
            print(f"[!] Error al inicializar hardware ZKTeco: {e}")
            return False

    def acquire_fingerprint(self):
        if self.device_opened and self.zkfp2:
            try:
                capture = self.zkfp2.AcquireFingerprint()
                if capture:
                    template, img_bytes = capture
                    w = getattr(self.zkfp2, 'width', self.width)
                    h = getattr(self.zkfp2, 'height', self.height)
                    # Convertir bytes crudos a imagen en escala de grises a 500 DPI
                    img = Image.frombytes("L", (w, h), img_bytes)
                    return img
            except Exception as e:
                print(f"[!] Error al capturar del ZKTeco: {e}")
        return None

    def close(self):
        if self.device_opened and self.zkfp2:
            try:
                self.zkfp2.CloseDevice()
                self.zkfp2.Terminate()
            except Exception:
                pass
            self.device_opened = False

scanner = ZKScannerController()

def generate_sample_forensic_fingerprint():
    """Genera dactilograma pericial de calibración si el hardware físico no está colocado"""
    w, h = 280, 360
    img = Image.new("L", (w, h), color=255)
    draw = ImageDraw.Draw(img)
    # Dibujar crestas papilares elípticas concéntricas (tipo verticilo / presilla)
    cx, cy = w // 2, h // 2
    for r in range(15, 120, 6):
        bbox = [cx - r, cy - int(r * 1.3), cx + r, cy + int(r * 1.3)]
        draw.arc(bbox, start=0, end=360, fill=30, width=3)
    return img

def image_to_base64_jpeg(pil_img):
    buffer = io.BytesIO()
    pil_img.save(buffer, format="JPEG", quality=95)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"

async def notify_clients(message_dict):
    if not CLIENTS:
        return
    text = json.dumps(message_dict)
    dead = set()
    for ws in list(CLIENTS):
        try:
            await ws.send(text)
        except Exception:
            dead.add(ws)
    CLIENTS.difference_update(dead)

async def capture_loop():
    global CAPTURE_ACTIVE
    while True:
        if CAPTURE_ACTIVE:
            img = scanner.acquire_fingerprint()
            if img:
                print("[✓] ¡Huella dactilar capturada por ZKTeco! Transmitiendo a PWA...")
                b64 = image_to_base64_jpeg(img)
                await notify_clients({
                    "type": "FRAME",
                    "data": b64
                })
                await notify_clients({
                    "type": "STATUS",
                    "state": "idle",
                    "message": "Huella ZKTeco adquirida exitosamente a 500 DPI."
                })
                CAPTURE_ACTIVE = False
        await asyncio.sleep(0.15)

async def ws_handler(websocket):
    global CAPTURE_ACTIVE, CURRENT_MODE
    CLIENTS.add(websocket)
    remote = websocket.remote_address
    print(f"[+] Cliente PWA conectado desde: {remote}")

    # Enviar estado inicial de bienvenida
    await websocket.send(json.dumps({
        "type": "STATUS",
        "state": "connected",
        "message": "Conectado al Puente ZKTeco (Bicrim San Javier)"
    }))

    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
                mtype = msg.get("type")

                if mtype == "HANDSHAKE":
                    print(f"[*] Handshake recibido de la PWA: {msg.get('client')}")
                    await websocket.send(json.dumps({
                        "type": "STATUS",
                        "state": "connected",
                        "message": "Puente ZKTeco listo para recibir órdenes periciales."
                    }))

                elif mtype == "TRIGGER_CAPTURE":
                    CURRENT_MODE = msg.get("mode", "ROLLED")
                    CAPTURE_ACTIVE = True
                    print(f"[*] PWA solicitó toma dactilar: {CURRENT_MODE}. Coloque el dedo en el ZKTeco...")
                    await notify_clients({
                        "type": "STATUS",
                        "state": "capturing",
                        "message": f"Apoye el dedo en el lector ZKTeco ({CURRENT_MODE})..."
                    })

                    # Si el lector físico no está conectado, enviar huella tras 2.5 seg para probar
                    if not scanner.device_opened:
                        await asyncio.sleep(2.5)
                        if CAPTURE_ACTIVE:
                            print("[i] Modo demostración: enviando huella de calibración...")
                            test_img = generate_sample_forensic_fingerprint()
                            b64 = image_to_base64_jpeg(test_img)
                            await notify_clients({
                                "type": "FRAME",
                                "data": b64
                            })
                            await notify_clients({
                                "type": "STATUS",
                                "state": "idle",
                                "message": "Huella transmitida a la PWA (Modo Calibración)."
                            })
                            CAPTURE_ACTIVE = False

                elif mtype == "ABORT_CAPTURE":
                    CAPTURE_ACTIVE = False
                    print("[*] Captura abortada por el usuario.")
                    await notify_clients({
                        "type": "STATUS",
                        "state": "idle",
                        "message": "Captura detenida."
                    })

            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"[-] Cliente PWA desconectado: {remote}")

async def main():
    print("=" * 65)
    print("  LiveScan Mobile Forensic - Servidor Puente ZKTeco")
    print("  Perito Forense Jorge PINO A. / Bicrim San Javier")
    print("=" * 65)
    print(f"[*] Escuchando conexiones WebSocket en ws://0.0.0.0:{PORT}")
    print("[*] En tu PWA selecciona: '2. Wi-Fi Bridge PC'")
    print(f"[*] Dirección en PWA local: ws://127.0.0.1:{PORT}/ws")
    print("=" * 65)

    asyncio.create_task(capture_loop())

    async with websockets.serve(ws_handler, "0.0.0.0", PORT):
        await asyncio.Future()  # Correr indefinidamente

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Servidor Puente detenido por el usuario.")
        scanner.close()
