@echo off
setlocal EnableExtensions

set "INSTALL_ROOT=%LOCALAPPDATA%\MiMoLight"
set "APP_EXE=%INSTALL_ROOT%\app\MiMoTrafficLight.exe"

if exist "%APP_EXE%" (
    start "" "%APP_EXE%"
) else (
    echo [MiMoTrafficLight] Warning: MiMoTrafficLight.exe was not found.
    echo [MiMoTrafficLight] Run scripts\install.ps1 first.
)

if not "%~1"=="" (
    if exist "%~1\" (
        cd /d "%~1"
    ) else (
        echo [MiMoTrafficLight] Warning: target directory does not exist: %~1
    )
)

echo MiMo project directory: %CD%

where mimo >nul 2>nul
if %ERRORLEVEL%==0 (
    mimo
    goto :end
)

where mimocode >nul 2>nul
if %ERRORLEVEL%==0 (
    mimocode
    goto :end
)

where mimo-code >nul 2>nul
if %ERRORLEVEL%==0 (
    mimo-code
    goto :end
)

echo [MiMoTrafficLight] Error: MiMo Code command was not found.
echo [MiMoTrafficLight] Please confirm the real command by running: where mimo / where mimocode / where mimo-code

:end
endlocal
