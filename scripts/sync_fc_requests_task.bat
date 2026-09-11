@echo off
rem For Task Scheduler (no pause). Log: %TEMP%\fsm_fc_sync.log
cd /d "%~dp0"
python sync_fc_requests.py >> "%TEMP%\fsm_fc_sync.log" 2>&1
