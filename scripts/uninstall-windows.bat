@echo off
setlocal

rem Wellau Switch 安装能力测试清理启动器 (Windows)
rem 自动请求管理员权限（卸载 Node MSI / 删系统文件时需要），并把参数转发给 ps1。
rem 用法：
rem   双击运行（默认清理，不删 Node）
rem   uninstall-windows.bat -Node          （同时卸载 Node.js）
rem   uninstall-windows.bat -KeepLogin     （保留登录态）

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%uninstall-windows.ps1"

if not exist "%PS_SCRIPT%" (
  echo Error: uninstall-windows.ps1 not found: "%PS_SCRIPT%"
  exit /b 1
)

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator rights...
  if "%*"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  )
  echo An elevated window should open.
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
pause
exit /b %EXIT_CODE%
