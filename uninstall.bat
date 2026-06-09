@echo off
setlocal

net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

set "PLUGIN_DST=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.magro.aicutscenefinder"

if exist "%PLUGIN_DST%" (
    rmdir /s /q "%PLUGIN_DST%"
    echo Plugin rimosso da: %PLUGIN_DST%
) else (
    echo Plugin non trovato in: %PLUGIN_DST%
)
echo.
pause
endlocal
