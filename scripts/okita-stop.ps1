# OKITA dev port closer (Windows side)
# 管理者 PowerShell から実行すること。
# 開発終了後・公衆 Wi-Fi に移動する前に必ず実行する。
# Usage:
#   .\okita-stop.ps1

netsh interface portproxy delete v4tov4 listenport=8081 listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenport=8765 listenaddress=0.0.0.0 2>$null | Out-Null
Remove-NetFirewallRule -DisplayName "Expo Metro 8081" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "OKITA API 8765"  -ErrorAction SilentlyContinue

Write-Host "[OKITA] dev ports closed" -ForegroundColor Yellow

$remainingPp = netsh interface portproxy show v4tov4 | Select-String -Pattern '8081|8765'
if ($remainingPp) {
  Write-Host "WARN: portproxy にまだ残りがあります:" -ForegroundColor Red
  $remainingPp
} else {
  Write-Host "  portproxy: 8081/8765 ともに削除済み" -ForegroundColor Green
}

$remainingFw = Get-NetFirewallRule -DisplayName "Expo Metro 8081","OKITA API 8765" -ErrorAction SilentlyContinue
if ($remainingFw) {
  Write-Host "WARN: ファイアウォール ルールが残っています:" -ForegroundColor Red
  $remainingFw | Format-Table DisplayName,Enabled,Profile -AutoSize
} else {
  Write-Host "  Firewall:  ルール削除済み" -ForegroundColor Green
}
