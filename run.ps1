# Wird von der Windows-Aufgabenplanung aufgerufen. Schreibt ein Log nach logs\.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force logs | Out-Null
$log = Join-Path 'logs' ("{0:yyyy-MM}.log" -f (Get-Date))
& node src/main.js *>> $log
exit $LASTEXITCODE
