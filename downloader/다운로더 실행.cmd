@echo off
chcp 65001 >nul
title Yose Guardian Downloader
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0downloader.ps1"
exit /b 0
