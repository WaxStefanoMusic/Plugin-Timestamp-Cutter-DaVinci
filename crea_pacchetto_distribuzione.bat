@echo off
setlocal enabledelayedexpansion

rem Crea una cartella "Distribuzione" con solo i file necessari per
rem installare il plugin su altri PC. Copia questa cartella sul PC
rem di destinazione e lancia install.bat da li'.

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "DIST=%PROJECT_ROOT%\Distribuzione"

echo.
echo === Crea pacchetto distribuzione ===
echo   Output: %DIST%
echo.

if exist "%DIST%" (
    echo Rimuovo cartella Distribuzione precedente...
    rmdir /s /q "%DIST%"
)

mkdir "%DIST%" 2>nul
mkdir "%DIST%\plugin" 2>nul

echo Copio plugin...
xcopy "%PROJECT_ROOT%\plugin\com.magro.aicutscenefinder" "%DIST%\plugin\com.magro.aicutscenefinder\" /E /I /Q /Y >nul

echo Copio script...
copy /Y "%PROJECT_ROOT%\install.bat" "%DIST%\install.bat" >nul
copy /Y "%PROJECT_ROOT%\uninstall.bat" "%DIST%\uninstall.bat" >nul
copy /Y "%PROJECT_ROOT%\README.txt" "%DIST%\README.txt" >nul

rem Leggi la versione da package.json (solo numero in "version": "x.y.z")
set "VERSION=0.0.0"
for /f "tokens=2 delims=:," %%a in ('findstr /c:"\"version\"" "%PROJECT_ROOT%\plugin\com.magro.aicutscenefinder\package.json"') do (
    set "VERSION=%%~a"
)
set "VERSION=%VERSION: =%"
set "VERSION=%VERSION:"=%"

set "ZIP=%PROJECT_ROOT%\Distribuzione-v%VERSION%.zip"

echo Creo zip release: %ZIP%
if exist "%ZIP%" del /q "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%DIST%\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
    echo ATTENZIONE: creazione zip fallita ^(richiede PowerShell^). Cartella Distribuzione comunque pronta.
)

echo.
echo === Fatto ===
echo.
echo La cartella "%DIST%" e' pronta per essere copiata su altri PC.
echo Lo zip "%ZIP%" e' pronto per il release GitHub (versione %VERSION%).
echo.
echo Sul PC di destinazione:
echo   1. Copia la cartella Distribuzione dove vuoi
echo   2. Doppio click su install.bat (conferma UAC)
echo   3. Riavvia DaVinci Resolve
echo.
pause
endlocal
