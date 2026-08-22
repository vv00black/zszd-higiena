@echo off
cd /d "%~dp0"

echo ========================================
echo   Wysylanie aktualizacji na GitHub
echo ========================================
echo.

git add -A

git diff --cached --quiet
if %errorlevel%==0 (
  echo Nie ma zadnych nowych zmian do wyslania.
  echo Strona jest juz aktualna.
  echo.
  pause
  exit /b
)

for /f "tokens=1-3 delims=/. " %%a in ('date /t') do set DZIS=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TERAZ=%%a-%%b

git commit -m "Aktualizacja %DZIS% %TERAZ%"

echo.
echo Wysylanie na GitHub...
git push

echo.
echo ========================================
echo   Gotowe! Strona zaktualizuje sie
echo   automatycznie w ciagu minuty.
echo ========================================
echo.
pause
