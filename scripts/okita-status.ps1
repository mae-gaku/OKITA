# OKITA dev port status checker (Windows side)
# 通常 PowerShell でも実行可。
# Usage:
#   .\okita-status.ps1

Write-Host "=== portproxy (v4tov4) ===" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "=== Firewall rules (Expo / OKITA) ===" -ForegroundColor Cyan
$rules = Get-NetFirewallRule -DisplayName "Expo*","OKITA*" -ErrorAction SilentlyContinue
if ($rules) {
  $rules | Format-Table DisplayName,Enabled,Direction,Action,Profile -AutoSize
} else {
  Write-Host "  なし" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Network profile ===" -ForegroundColor Cyan
Get-NetConnectionProfile | Format-Table Name,InterfaceAlias,NetworkCategory -AutoSize

Write-Host ""
Write-Host "=== Local LAN IP (Wi-Fi) ===" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet' -and $_.IPAddress -notmatch '^169\.' } | Format-Table InterfaceAlias,IPAddress -AutoSize
