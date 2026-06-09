@echo off
setlocal enabledelayedexpansion

rem =============================================================
rem  Video Timestamp Cutter - Installer per DaVinci Resolve Studio
rem  Doppio click per installare. Auto-eleva UAC se serve.
rem =============================================================

rem Auto-elevate se non e' in esecuzione come Amministratore.
net session >nul 2>&1
if errorlevel 1 (
    echo Richiedo privilegi di amministratore...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

set "PLUGIN_SRC=%PROJECT_ROOT%\plugin\com.magro.aicutscenefinder"
set "RESOLVE_SUPPORT=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support"
set "PLUGINS_DIR=%RESOLVE_SUPPORT%\Workflow Integration Plugins"
set "PLUGIN_DST=%PLUGINS_DIR%\com.magro.aicutscenefinder"

echo.
echo === Video Timestamp Cutter - Install ===
echo   Sorgente: %PLUGIN_SRC%
echo   Destinaz.: %PLUGIN_DST%
echo.

if not exist "%PLUGIN_SRC%" (
    echo ERRORE: Cartella plugin sorgente non trovata:
    echo   %PLUGIN_SRC%
    echo Assicurati di aver copiato l'intera cartella del progetto.
    pause
    exit /b 1
)

if not exist "%PLUGIN_SRC%\WorkflowIntegration.node" (
    echo ERRORE: Manca WorkflowIntegration.node nella cartella plugin.
    echo Il pacchetto e' incompleto.
    pause
    exit /b 1
)

if not exist "%RESOLVE_SUPPORT%" (
    echo ERRORE: Non trovo DaVinci Resolve in:
    echo   %RESOLVE_SUPPORT%
    echo Installa DaVinci Resolve Studio prima di installare il plugin.
    pause
    exit /b 1
)

rem Crea la cartella Workflow Integration Plugins se non esiste.
if not exist "%PLUGINS_DIR%" (
    mkdir "%PLUGINS_DIR%" 2>nul
)

rem Rimuovi installazione precedente.
if exist "%PLUGIN_DST%" (
    echo Rimuovo installazione precedente...
    rmdir /s /q "%PLUGIN_DST%"
)

echo Copio plugin...
mkdir "%PLUGIN_DST%" 2>nul
xcopy "%PLUGIN_SRC%\*" "%PLUGIN_DST%\" /E /I /Q /Y >nul
if errorlevel 1 (
    echo ERRORE: Copia fallita.
    pause
    exit /b 1
)

echo.
echo === Installazione completata ===
echo.
echo Prossimi passi:
echo   1. Chiudi completamente DaVinci Resolve (se aperto)
echo   2. Riapri DaVinci Resolve
echo   3. Menu: Workspace -^> Workflow Integrations -^> Video Timestamp Cutter
echo.
pause
endlocal
