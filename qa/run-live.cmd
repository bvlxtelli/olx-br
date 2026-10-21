@echo off
REM QA - LIVE SUITE against apps.olx.com.br / auth.olx.com.br.
REM It NEVER runs in the default CI and NEVER mirrors www.olx.com.br (403 Cloudflare).
REM It is NEVER a merge blocker.
REM
REM   qa\run-live.cmd                  -> fake token (auth and error shape only, no real permission)
REM   set OLX_ACCESS_TOKEN=xxx & qa\run-live.cmd   -> real token (local mode of the owner)
REM   set OLX_FAIL_ON_LIVE=1 & qa\run-live.cmd      -> a network failure becomes a FAIL instead of a SKIP
setlocal
cd /d "%~dp0.."
if not exist dist\index.js (
  echo [QA] dist\index.js is missing. Building...
  call npm run build
  if errorlevel 1 exit /b 1
)
set OLX_LIVE=1
node --test --test-reporter=spec qa\live.test.js
set RC=%errorlevel%
if not "%RC%"=="0" echo [QA] the live suite FAILED ^(exit %RC%^)
exit /b %RC%
