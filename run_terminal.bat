@echo off
cd /d "%~dp0"
title NIFTY PRO TERMINAL - Launching Market Data Server
echo ===================================================================
echo               NIFTY PRO - TECHNICAL STUDY TERMINAL
echo ===================================================================
echo [1/2] Starting local Market Data Server on http://localhost:8080...
start "" http://localhost:8080
python server.py
pause
