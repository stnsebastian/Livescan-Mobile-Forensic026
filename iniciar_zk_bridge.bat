@echo off
chcp 65001 > nul
title LiveScan Mobile Forensic - Puente ZKTeco
color 0b

echo ====================================================================
echo      LiveScan Mobile Forensic - Servidor Puente ZKTeco
echo      Perito Forense Jorge PINO A. / Bicrim San Javier
echo ====================================================================
echo.
echo [1/2] Verificando dependencias necesarias (websockets, pillow, pyzkfp)...
python -m pip install --quiet websockets pillow pyzkfp
echo.
echo [2/2] Iniciando Servidor Puente en el puerto 8080...
echo.
echo --------------------------------------------------------------------
echo  En tu PWA LiveScan (Chrome):
echo   1. Cambia el origen a: "2. Wi-Fi Bridge PC"
echo   2. Si estás en esta misma PC, asegúrate que la URL sea:
echo      ws://127.0.0.1:8080/ws
echo   3. Haz clic en "INICIAR CAPTURA" y apoya el dedo en el ZKTeco.
echo --------------------------------------------------------------------
echo.

python zk_bridge.py

echo.
echo Servidor detenido.
pause
