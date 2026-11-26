@echo off
title The Hollow Labyrinth - LAN & Desktop Host
echo Starting The Hollow Labyrinth server on port 3000...
echo Friends on the same Wi-Fi or Hotspot can open the LAN URL shown below.
echo.
call npm run build
start "" "http://localhost:3000"
call npm start
pause
