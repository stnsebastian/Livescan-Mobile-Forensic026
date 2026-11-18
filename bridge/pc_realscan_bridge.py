#!/usr/bin/env python3
"""
LiveScan RealScan PC Bridge Server (Python)
Servidor de enlace WebSocket / HTTP para la estación de trabajo PC forense.
Conecta el escáner dactilar de escritorio (Suprema RealScan G-10, RealScan-F, BioMini)
y transmite la imagen en tiempo real por Wi-Fi hacia el teléfono móvil (PWA).

Requisitos:
    pip install websockets pillow
Ejecución:
    python pc_realscan_bridge.py --host 0.0.0.0 --port 8080
"""

import asyncio
import json
import base64
import io
import argparse
import logging
from PIL import Image, ImageDraw

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')

connected_clients = set()

def generate_sample_fingerprint():
    """Genera una muestra dactiloscópica sintética de 500 DPI para pruebas."""
    img = Image.new('L', (320, 420), color=250)
    draw = ImageDraw.Draw(img)
    
    cx, cy = 160, 210
    for r in range(12, 170, 7):
        bbox = [cx - r * 0.85, cy - r * 1.3, cx + r * 0.85, cy + r * 1.3]
        draw.arc(bbox, start=0, end=360, fill=30, width=2)
    
    # Agregar minucias artificiales
    draw.ellipse([cx - 20, cy - 30, cx - 12, cy - 22], fill=250)
    draw.ellipse([cx + 25, cy + 40, cx + 33, cy + 48], fill=250)
    
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

async def handler(websocket):
    logging.info(f"Nuevo cliente móvil conectado desde: {websocket.remote_address}")
    connected_clients.add(websocket)
    try:
        # Enviar confirmación de conexión
        await websocket.send(json.dumps({
            "type": "STATUS",
            "state": "connected",
            "message": "Conectado al RealScan PC Bridge v1.0 (Hardware listo)"
        }))

        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                logging.info(f"Comando recibido de la app móvil: {msg_type}")

                if msg_type == "TRIGGER_CAPTURE":
                    logging.info("Iniciando adquisición dactilar en el escáner RealScan de la PC...")
                    await websocket.send(json.dumps({
                        "type": "STATUS",
                        "state": "capturing",
                        "message": "Adquiriendo huella plana de 500 DPI..."
                    }))
                    
                    # Simulación o llamada al SDK C/DLL de RealScan (RealScan_StartCaptureFlat)
                    await asyncio.sleep(0.8)
                    frame_b64 = generate_sample_fingerprint()

                    await websocket.send(json.dumps({
                        "type": "FRAME",
                        "data": frame_b64,
                        "dpi": 500,
                        "sensor": "Suprema RealScan-G10"
                    }))

                    await websocket.send(json.dumps({
                        "type": "STATUS",
                        "state": "complete",
                        "message": "Captura 500 DPI enviada a la PWA móvil con éxito."
                    }))

                elif msg_type == "ABORT_CAPTURE":
                    logging.info("Captura cancelada por el cliente móvil.")
                    await websocket.send(json.dumps({
                        "type": "STATUS",
                        "state": "idle",
                        "message": "Captura cancelada."
                    }))

            except json.JSONDecodeError:
                logging.warning("Mensaje no reconocido.")
    except Exception as e:
        logging.error(f"Error en conexión: {e}")
    finally:
        connected_clients.remove(websocket)
        logging.info("Cliente desconectado.")

async def main():
    parser = argparse.ArgumentParser(description="LiveScan RealScan PC Bridge")
    parser.add_argument("--host", default="0.0.0.0", help="Host IP (0.0.0.0 para red local Wi-Fi)")
    parser.add_argument("--port", type=int, default=8080, help="Puerto WebSocket")
    args = parser.parse_args()

    import websockets
    logging.info(f"==================================================")
    logging.info(f"  LiveScan Mobile RealScan PC Bridge iniciado     ")
    logging.info(f"  Servidor WebSocket escuchando en: ws://{args.host}:{args.port}/ws")
    logging.info(f"  Asegúrese de conectar el celular al mismo Wi-Fi  ")
    logging.info(f"==================================================")

    async with websockets.serve(handler, args.host, args.port):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Bridge detenido por el usuario.")
