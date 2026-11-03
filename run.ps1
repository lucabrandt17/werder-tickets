# Wird von der Windows-Aufgabenplanung aufgerufen. Schreibt ein Log nach logs\.
# Holt vorher den aktuellen Stand von GitHub, damit Code-Aenderungen automatisch ankommen.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force logs | Out-Null
$log = Join-Path 'logs' ("{0:yyyy-MM}.log" -f (Get-Date))

$lockBefore = (Get-FileHash package-lock.json).Hash
& git pull --ff-only --quiet *>> $log
if ((Get-FileHash package-lock.json).Hash -ne $lockBefore) {
    & npm ci --silent *>> $log
}

& node src/main.js *>> $log
exit $LASTEXITCODE
