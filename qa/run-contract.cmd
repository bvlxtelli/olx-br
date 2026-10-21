@echo off
REM QA - OFFLINE CONTRACT SUITE (deterministic, no network, no secret).
REM This is the gate that the CI has to keep green.
REM
REM   qa\run-contract.cmd
REM
REM Needs `npm ci` (the dependencies of the package) and builds dist\ when it is missing.
setlocal
cd /d "%~dp0.."
if not exist dist\index.js (
  echo [QA] dist\index.js is missing. Building...
  call npm run build
  if errorlevel 1 exit /b 1
)
node --test --test-reporter=spec qa\contract.test.js
set RC=%errorlevel%
if not "%RC%"=="0" echo [QA] the offline contract suite FAILED ^(exit %RC%^)
exit /b %RC%
