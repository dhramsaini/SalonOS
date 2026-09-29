@echo off
rem SalonOS Tally Connector - double-click to start. Keep the window open while using Tally from SalonOS.
rem Tally on another computer or server? Right-click this file > Edit, and add e.g.  -TallyHost 192.168.1.20  at the end of the next line.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SalonOS-Tally-Connector.ps1"
