@echo off
rem Manual FC sync (see SETUP_SYNC.md). Scheduled runs use FSM_FC_Sync task.
cd /d "%~dp0"
python sync_fc_requests.py
pause
