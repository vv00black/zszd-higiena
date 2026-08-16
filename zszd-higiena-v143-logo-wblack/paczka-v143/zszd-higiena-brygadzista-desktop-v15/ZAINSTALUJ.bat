@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ==========================================
echo   ZSZD Higiena BRYGADZISTA - instalacja
echo ==========================================
echo.

REM ---- Wczytaj numer wersji (z pliku WERSJA.txt obok tego skryptu) ----
REM Ten plik jest aktualizowany razem z package.json przy kazdej nowej paczce -
REM dzieki temu nazwa pliku .exe zawsze pokazuje, ktora wersja jest zainstalowana.
set "WERSJA="
if exist "%~dp0WERSJA.txt" set /p WERSJA=<"%~dp0WERSJA.txt"
if not defined WERSJA set "WERSJA=nieznana"
set "NAZWA_EXE=zszd-higiena-brygadzista-v%WERSJA%.exe"
echo Wersja aplikacji: %WERSJA%
echo.

REM ---- Znajdz plik .exe ----
set "ZRODLO="
for %%F in ("%~dp0dist\ZSZD-Higiena-BRYGADZISTA-portable-*.exe") do set "ZRODLO=%%~fF"
if not defined ZRODLO (
  for %%F in ("%~dp0ZSZD-Higiena-BRYGADZISTA-portable-*.exe") do set "ZRODLO=%%~fF"
)

if not defined ZRODLO (
  echo BLAD: nie znalazlem pliku aplikacji.
  echo.
  echo Szukalem:
  echo   %~dp0dist\ZSZD-Higiena-BRYGADZISTA-portable-*.exe
  echo   %~dp0ZSZD-Higiena-BRYGADZISTA-portable-*.exe
  echo.
  echo Najpierw zbuduj aplikacje - uruchom ZBUDUJ.bat
  echo.
  pause
  exit /b 1
)

for %%F in ("%ZRODLO%") do set "NAZWA_PLIKU=%%~nxF"
echo Znaleziono: %NAZWA_PLIKU%
echo.

REM ---- Wybor folderu ----
echo Gdzie zainstalowac aplikacje?
echo.
echo   [1] %USERPROFILE%\ZSZD Higiena Brygadzista (zalecane - Twoj folder domowy)
echo   [2] %LOCALAPPDATA%\ZSZD Higiena Brygadzista (ukryty folder aplikacji)
echo   [3] Wskaze wlasny folder
echo.
set "WYBOR="
set /p WYBOR="Wybierz [1/2/3] (Enter = 1): "

if "%WYBOR%"=="" set WYBOR=1
if "%WYBOR%"=="1" set "CEL=%USERPROFILE%\ZSZD Higiena Brygadzista"
if "%WYBOR%"=="2" set "CEL=%LOCALAPPDATA%\ZSZD Higiena Brygadzista"
if "%WYBOR%"=="3" goto WLASNY_FOLDER
goto SPRAWDZ_CEL

:WLASNY_FOLDER
echo.
echo Podaj pelna sciezke do folderu, np. D:\Programy\ZSZD
echo (folder zostanie utworzony, jesli nie istnieje)
echo.
set /p CEL="Sciezka: "
if "%CEL%"=="" (
  echo.
  echo Nie podano sciezki - przerywam.
  echo.
  pause
  exit /b 1
)

:SPRAWDZ_CEL
echo.
echo Instaluje w: %CEL%
echo.

REM ---- Utworz folder ----
if not exist "%CEL%" (
  mkdir "%CEL%" 2>nul
  if errorlevel 1 (
    echo BLAD: nie moge utworzyc folderu.
    echo Sprawdz, czy masz uprawnienia do tej lokalizacji.
    echo.
    pause
    exit /b 1
  )
)

REM ---- Kopiuj aplikacje ----
REM Nazwa pliku zawiera numer wersji (np. zszd-higiena-admin-v1.6.6.exe), zeby
REM od razu bylo widac w Eksploratorze, ktora wersja jest zainstalowana.
REM Najpierw sprzatamy stare pliki .exe (poprzednie wersje, w tym stara stala
REM nazwa ZSZD-Higiena-BRYGADZISTA.exe sprzed wprowadzenia numerow w nazwie) -
REM zeby folder nie zasmiecal sie kolejnymi wersjami przy kazdej aktualizacji.
echo Kopiuje aplikacje...
if exist "%CEL%\zszd-higiena-brygadzista-v*.exe" del /q "%CEL%\zszd-higiena-brygadzista-v*.exe" 2>nul
if exist "%CEL%\ZSZD-Higiena-BRYGADZISTA.exe" del /q "%CEL%\ZSZD-Higiena-BRYGADZISTA.exe" 2>nul
copy /Y "%ZRODLO%" "%CEL%\%NAZWA_EXE%" >nul
if errorlevel 1 (
  echo BLAD: nie udalo sie skopiowac pliku.
  echo.
  pause
  exit /b 1
)

REM ---- Skrot na pulpicie ----
echo Tworze skrot na pulpicie...
set "PULPIT=%USERPROFILE%\Desktop"
if not exist "%PULPIT%" set "PULPIT=%USERPROFILE%\Pulpit"
if not exist "%PULPIT%" (
  for /f "tokens=2,*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop 2^>nul ^| find "Desktop"') do set "PULPIT=%%B"
)

set "SKROT_LNK=%PULPIT%\ZSZD Higiena BRYGADZISTA.lnk"
set "SKROT_EXE=%CEL%\%NAZWA_EXE%"
set "SKROT_DIR=%CEL%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SKROT_LNK); ^
   $s.TargetPath = $env:SKROT_EXE; ^
   $s.WorkingDirectory = $env:SKROT_DIR; ^
   $s.Description = 'ZSZD Higiena BRYGADZISTA'; ^
   $s.Save()" 2>nul

if exist "%PULPIT%\ZSZD Higiena BRYGADZISTA.lnk" (
  echo   Skrot utworzony.
) else (
  echo   UWAGA: nie udalo sie utworzyc skrotu automatycznie.
  echo   Mozesz zrobic go recznie: prawy przycisk na pliku .exe w folderze
  echo   %CEL% -^> "Wyslij do" -^> "Pulpit (utworz skrot)"
)

REM ---- Skrot w Menu Start ----
set "MENUSTART=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
if exist "%MENUSTART%" (
  set "SKROT_LNK=%MENUSTART%\ZSZD Higiena BRYGADZISTA.lnk"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SKROT_LNK); ^
     $s.TargetPath = $env:SKROT_EXE; ^
     $s.WorkingDirectory = $env:SKROT_DIR; ^
     $s.Save()" 2>nul
  if exist "%MENUSTART%\ZSZD Higiena BRYGADZISTA.lnk" echo   Skrot w Menu Start utworzony.
)

echo.
echo ==========================================
echo   GOTOWE
echo ==========================================
echo.
echo Aplikacja:  %CEL%\%NAZWA_EXE%
echo Skrot:      Pulpit + Menu Start
echo.
echo Dane zapisuja sie w profilu uzytkownika:
echo %APPDATA%\zszd-higiena-brygadzista
echo (przy aktualizacji uruchom ten plik ponownie - dane zostana)
echo.

set "OTWORZ="
set /p OTWORZ="Uruchomic aplikacje teraz? [T/n]: "
if /i "%OTWORZ%"=="n" goto KONIEC
start "" "%CEL%\%NAZWA_EXE%"

:KONIEC
echo.
pause
exit /b 0
