@echo off
setlocal enabledelayedexpansion

rem Crea uno zip "Installer-vX.Y.Z.zip" pronto per il release GitHub.
rem Lo staging viene fatto in %TEMP% per evitare il conflitto
rem case-insensitive con la cartella sorgente "installer/" sul project root.

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

rem Leggi la versione da package.json
set "VERSION=0.0.0"
for /f "tokens=2 delims=:," %%a in ('findstr /c:"\"version\"" "%PROJECT_ROOT%\plugin\com.magro.aicutscenefinder\package.json"') do (
    set "VERSION=%%~a"
)
set "VERSION=%VERSION: =%"
set "VERSION=%VERSION:"=%"

set "STAGE=%TEMP%\vtcutter-pkg-build"
set "STAGE_INST=%STAGE%\Installer"
set "ZIP=%PROJECT_ROOT%\Installer-v%VERSION%.zip"

echo.
echo === Crea pacchetto Installer ===
echo   Staging: %STAGE_INST%
echo   Output : %ZIP%
echo.

if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE_INST%" 2>nul
mkdir "%STAGE_INST%\plugin" 2>nul
mkdir "%STAGE_INST%\installer" 2>nul

echo Copio plugin...
xcopy "%PROJECT_ROOT%\plugin\com.magro.aicutscenefinder" "%STAGE_INST%\plugin\com.magro.aicutscenefinder\" /E /I /Q /Y >nul

echo Copio installer grafico...
copy /Y "%PROJECT_ROOT%\Install.vbs" "%STAGE_INST%\Install.vbs" >nul
copy /Y "%PROJECT_ROOT%\installer\install.ps1" "%STAGE_INST%\installer\install.ps1" >nul

echo Copio uninstaller + readme...
copy /Y "%PROJECT_ROOT%\uninstall.bat" "%STAGE_INST%\uninstall.bat" >nul
copy /Y "%PROJECT_ROOT%\README.txt" "%STAGE_INST%\README.txt" >nul

echo Creo zip...
if exist "%ZIP%" del /q "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%STAGE_INST%\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
    echo ERRORE: creazione zip fallita ^(richiede PowerShell^).
    rmdir /s /q "%STAGE%"
    pause
    exit /b 1
)

rmdir /s /q "%STAGE%"

echo.
echo === Fatto ===
echo.
echo Zip release pronto: %ZIP%
echo Versione: %VERSION%
echo.
echo Sul PC di destinazione:
echo   1. Estrai lo zip dove vuoi
echo   2. Doppio click su Install.vbs (conferma UAC, si apre l'installer grafico)
echo   3. Conferma o cambia la cartella, click "Installa"
echo   4. Riavvia DaVinci Resolve
echo.
pause
endlocal
