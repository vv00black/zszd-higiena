@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   ZSZD Higiena Admin PWA - Wgrywanie na GitHub
echo   Repo: vv00black/zszd-higiena
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo BLAD: Git nie jest zainstalowany.
    echo Pobierz z: https://git-scm.com/download/win
    pause & exit /b 1
)

if not exist "index.html" (
    echo BLAD: Nie znaleziono index.html
    echo Uruchom ten skrypt z folderu zszd-higiena-admin-PWA-vXXX
    pause & exit /b 1
)

echo Folder: %CD%
echo.

if not exist ".git" (
    echo Inicjalizacja Git...
    git init
    git remote add origin https://github.com/vv00black/zszd-higiena.git
    echo OK
    echo.
) else (
    git remote set-url origin https://github.com/vv00black/zszd-higiena.git 2>nul
)

for /f "delims=" %%N in ('git config user.name 2^>nul') do set GIT_USER=%%N
if not defined GIT_USER (
    git config user.name "vv00black"
    git config user.email "vvojtek@interia.pl"
)

echo Synchronizacja z GitHub...
git fetch origin main >nul 2>&1

echo Dodawanie plikow...
git add index.html app.js db.js magazyn.js obecnosc.js szkolenia.js zuzycie.js
git add harmonogram-codzienny.js harmonogram-cykliczny.js satelity.js
git add manifest.json sw.js README.md
git add assets icons 2>nul
git add netlify.toml 2>nul
git add firebase-sync.js 2>nul

rem NAPRAWA (Aug 24): poprzednia wersja konczyla sie tutaj, gdy nie bylo
rem nowych zmian lokalnie ("Brak zmian") - ale to NIE oznacza, ze poprzedni
rem commit faktycznie dotarl na GitHub. Jesli poprzednie uruchomienie
rem skonczylo sie bledem push (np. zla nazwa repo), skrypt nigdy wiecej nie
rem probowal wyslac, mylnie pokazujac "wszystko aktualne". Teraz ZAWSZE
rem probujemy push ponizej, niezaleznie czy byl nowy commit.
git diff --cached --quiet
if errorlevel 1 (
    set COMMIT_MSG=ZSZD Higiena Admin PWA - %DATE% %TIME:~0,5%
    git commit -m "!COMMIT_MSG!"
) else (
    echo Brak nowych zmian lokalnie - sprawdzam czy wszystko jest juz wyslane...
)

for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%B
if "!CURRENT_BRANCH!"=="master" (
    git branch -m master main
)

echo.
echo Wgrywanie na GitHub...
git push -u origin main --force

if errorlevel 1 (
    echo.
    echo BLAD podczas wgrywania.
    pause & exit /b 1
)

echo.
echo ========================================
echo   GOTOWE! PWA wgrane na GitHub.
echo   https://vv00black.github.io/zszd-higiena
echo ========================================
echo.
pause
