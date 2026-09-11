# FC 資格情報をユーザー環境変数に登録する（対話式・値は画面に残さない）
# 実行: powershell -ExecutionPolicy Bypass -File .\setup_fc_env.ps1
$u = Read-Host 'FC ID(社員番号)'
$p = Read-Host 'FCパスワード(入力は表示されません)' -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)
try {
  [Environment]::SetEnvironmentVariable('FC_USER', $u, 'User')
  [Environment]::SetEnvironmentVariable('FC_PASS', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b), 'User')
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
}
Write-Host "登録しました (FC_USER=$u)"
