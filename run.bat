@echo off
chcp 65001 >nul
title Kod Novorossii
cd /d "%~dp0backend"
where python >nul 2>nul || (echo Установите Python 3.10+ с python.org и отметьте "Add to PATH" & pause & exit /b 1)
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt
echo.
echo  Сайт: http://localhost:8000    API: http://localhost:8000/docs
echo  Для телефона в той же Wi-Fi: http://IP-этого-компьютера:8000
echo.
start "" http://localhost:8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
