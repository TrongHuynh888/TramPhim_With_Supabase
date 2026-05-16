@echo off
echo [*] Cai dat FFmpeg (Yeu cau co Winget) ...
winget install -e --id Gyan.FFmpeg
echo.
echo [*] Cai dat Python Libs cho AI Server ...
pip install -r requirements.txt
echo.
echo [+] Cai dat thanh cong! Nhan phim bat ky de thoat.
pause
