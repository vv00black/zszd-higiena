@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   ZSZD Higiena ADMIN - budowanie .exe
echo ========================================
echo.

REM ---- 1. Znajdz Node.js ----
REM Najpierw sprawdz, czy node jest juz dostepny w systemie
where node >nul 2>&1
if %errorlevel%==0 goto NODE_OK

echo Szukam Node.js...

REM Sciezka zapisana przy poprzednim uruchomieniu
if exist "%~dp0node-sciezka.txt" (
  set /p NODEDIR=<"%~dp0node-sciezka.txt"
  if exist "!NODEDIR!\node.exe" (
    set "PATH=!NODEDIR!;%PATH%"
    goto NODE_OK
  )
)

REM Typowe miejsca, gdzie moze lezec Node portable
for %%D in (
  "%USERPROFILE%\programy\node-v24.18.0-win-x64\node-v24.18.0-win-x64"
  "%USERPROFILE%\programy\node"
  "C:\nodejs"
  "%~dp0node"
) do (
  if exist "%%~D\node.exe" (
    set "PATH=%%~D;%PATH%"
    echo %%~D> "%~dp0node-sciezka.txt"
    goto NODE_OK
  )
)

REM Szukanie w folderze "programy" uzytkownika
for /d %%D in ("%USERPROFILE%\programy\node-v*-win-x64") do (
  if exist "%%~D\node.exe" (
    set "PATH=%%~D;%PATH%"
    echo %%~D> "%~dp0node-sciezka.txt"
    goto NODE_OK
  )
  for /d %%E in ("%%~D\node-v*-win-x64") do (
    if exist "%%~E\node.exe" (
      set "PATH=%%~E;%PATH%"
      echo %%~E> "%~dp0node-sciezka.txt"
      goto NODE_OK
    )
  )
)

REM Nie znaleziono - zapytaj uzytkownika
echo.
echo Nie znalazlem Node.js.
echo.
echo Podaj sciezke do folderu, w ktorym lezy node.exe
echo (np. C:\Users\TwojaNazwa\programy\node-v24.18.0-win-x64\node-v24.18.0-win-x64)
echo.
set /p NODEDIR="Sciezka: "
if not exist "!NODEDIR!\node.exe" (
  echo.
  echo BLAD: w podanym folderze nie ma pliku node.exe
  echo.
  pause
  exit /b 1
)
set "PATH=!NODEDIR!;%PATH%"
echo !NODEDIR!> "%~dp0node-sciezka.txt"

:NODE_OK
for /f "delims=" %%V in ('node --version 2^>nul') do set NODEVER=%%V
echo Node.js: %NODEVER%
echo.

REM ---- 2. Instalacja skladnikow ----
echo [1/3] Instaluje skladniki (moze potrwac kilka minut)...
call npm.cmd install --silent
if errorlevel 1 goto BLAD_INSTALL

REM ---- 3. Zatwierdzenie skryptow Electrona ----
echo [2/3] Zatwierdzam skladniki Electrona...
call npm.cmd approve-scripts electron >nul 2>&1
call npm.cmd install --silent >nul 2>&1

REM ---- 4. Budowanie ----
echo [3/3] Buduje plik .exe (3-10 minut, prosze czekac)...
echo.
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm.cmd run build
if errorlevel 1 goto BLAD_BUILD

REM ---- 5. Gotowe ----
echo.
echo ========================================
echo   GOTOWE
echo ========================================
echo.
if exist "%~dp0dist\ZSZD-Higiena-ADMIN-portable-1.1.0.exe" (
  echo Plik gotowy:
  echo %~dp0dist\ZSZD-Higiena-ADMIN-portable-1.1.0.exe
  echo.
  echo.
  set "INST="
  set /p INST="Zainstalowac teraz (skrot na pulpicie)? [T/n]: "
  if /i not "!INST!"=="n" (
    call "%~dp0ZAINSTALUJ.bat"
    exit /b 0
  )
  echo Otwieram folder z plikiem...
  start "" "%~dp0dist"
) else (
  echo Sprawdz folder dist - powinien tam byc plik .exe
  start "" "%~dp0dist"
)
echo.
pause
exit /b 0

:BLAD_INSTALL
echo.
echo ========================================
echo   BLAD podczas instalacji skladnikow
echo ========================================
echo.
echo Sprawdz polaczenie z internetem i sprobuj ponownie.
echo.
pause
exit /b 1

:BLAD_BUILD
echo.
echo ========================================
echo   BLAD podczas budowania
echo ========================================
echo.
echo Sprobuj usunac folder node_modules i uruchomic ten plik ponownie.
echo Jesli blad sie powtarza - przeslij zrzut ekranu z trescia bledu.
echo.
pause
exit /b 1
