@echo off
setlocal

if not exist "%~dp0netzwerk_topologie_tool.html" (
    echo Fehler: netzwerk_topologie_tool.html wurde nicht gefunden.
    echo Bitte start.bat im selben Ordner wie die HTML-Datei ablegen.
    pause
    exit /b 1
)

start "" "%~dp0netzwerk_topologie_tool.html"
if errorlevel 1 (
    echo Fehler: Die Anwendung konnte nicht im Standardbrowser geoeffnet werden.
    pause
    exit /b 1
)

exit /b 0
