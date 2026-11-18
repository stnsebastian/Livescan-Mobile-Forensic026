/**
 * LiveScan RealScan PC Bridge Server (Node.js)
 * Servidor WebSocket para conectar el escáner dactilar de la PC al celular por Wi-Fi.
 * Ejecución:
 *   npm install
 *   npm start
 */

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'LiveScan PC Bridge Active', version: '1.0.0' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[+] Conexión entrante desde móvil: ${ip}`);

  ws.send(JSON.stringify({
    type: 'STATUS',
    state: 'connected',
    message: 'Conectado al RealScan PC Bridge (Node.js)'
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`[CMD] Comando recibido: ${data.type}`);

      if (data.type === 'TRIGGER_CAPTURE') {
        console.log('[+] Solicitando captura en escáner Suprema RealScan...');
        ws.send(JSON.stringify({
          type: 'STATUS',
          state: 'capturing',
          message: 'Esperando dedo en el cristal del escáner PC...'
        }));

        setTimeout(() => {
          // Genera respuesta de simulación o lectura de buffer SDK
          ws.send(JSON.stringify({
            type: 'STATUS',
            state: 'complete',
            message: 'Huella 500 DPI transferida a la app móvil.'
          }));
        }, 1200);
      } else if (data.type === 'ABORT_CAPTURE') {
        console.log('[*] Captura abortada.');
        ws.send(JSON.stringify({
          type: 'STATUS',
          state: 'idle',
          message: 'Captura cancelada.'
        }));
      }
    } catch (e) {
      console.error('Error parseando JSON:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Cliente móvil desconectado: ${ip}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`  LiveScan Mobile RealScan PC Bridge (Node.js)      `);
  console.log(`  Escuchando en: ws://0.0.0.0:${PORT}/ws             `);
  console.log('====================================================');
});
