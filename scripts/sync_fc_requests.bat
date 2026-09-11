@echo off
rem FC依頼同期の手動実行（急ぎで同期したいとき用）。定期実行はタスクスケジューラ登録済み。
cd /d "%~dp0"
python sync_fc_requests.py
pause
