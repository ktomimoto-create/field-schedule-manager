@echo off
rem タスクスケジューラ用（pause 無し・ログは %TEMP%\fsm_fc_sync.log）
cd /d "%~dp0"
python sync_fc_requests.py >> "%TEMP%\fsm_fc_sync.log" 2>&1
