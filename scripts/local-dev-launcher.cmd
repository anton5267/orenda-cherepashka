@echo off
setlocal
cd /d "%~dp0.."

if not exist ".local" mkdir ".local"

call npm.cmd run dev 1>>".local\local-stack.stdout.log" 2>>".local\local-stack.stderr.log"
