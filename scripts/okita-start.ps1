# OKITA dev port opener (Windows side)
# 管理者 PowerShell から実行すること。
# Usage:
#   .\okita-start.ps1 -WslIp 172.x.x.x

param(
  [Parameter(Mandatory=$true)][string]$WslIp
)

# 既存ルール/プロキシは念のためクリア(設定上書き目的)
netsh interface portproxy delete v4tov4 listenport=8081 listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenport=8765 listenaddress=0.0.0.0 2>$null | Out-Null
Remove-NetFirewallRule -DisplayName "Expo Metro 8081" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "OKITA API 8765"  -ErrorAction SilentlyContinue

# portproxy
netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8081 connectaddress=$WslIp | Out-Null
netsh interface portproxy add v4tov4 listenport=8765 listenaddress=0.0.0.0 connectport=8765 connectaddress=$WslIp | Out-Null

# Firewall (Private プロファイルのみ。公衆 Wi-Fi では効かない)
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow -Profile Private | Out-Null
New-NetFirewallRule -DisplayName "OKITA API 8765"  -Direction Inbound -LocalPort 8765 -Protocol TCP -Action Allow -Profile Private | Out-Null

Write-Host "[OKITA] dev ports opened (Profile=Private only)" -ForegroundColor Green
Write-Host "  8081 (Expo Metro) -> $WslIp:8081"
Write-Host "  8765 (FastAPI)    -> $WslIp:8765"
Write-Host ""
Write-Host "Current portproxy:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4
Write-Host ""
Write-Host "!! 開発終了後は必ず .\okita-stop.ps1 を実行して穴を塞ぐこと !!" -ForegroundColor Yellow
