param(
  [string]$AppDirectory = "C:\GuanChen",
  [string]$Source = "G:\GuanChenData\accounts",
  [string]$Target = "G:\GuanChenBackups",
  [int]$Keep = 14,
  [string]$Log = "G:\GuanChenData\logs\backup.log"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
Set-Location -LiteralPath $AppDirectory
$started = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
"[$started] backup start source=$Source target=$Target keep=$Keep" | Out-File -FilePath $Log -Append -Encoding utf8

& npm.cmd run ops:backup -- "--source=$Source" "--target=$Target" "--keep=$Keep" *>> $Log
$code = $LASTEXITCODE
$finished = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
"[$finished] backup exit=$code" | Out-File -FilePath $Log -Append -Encoding utf8
exit $code
