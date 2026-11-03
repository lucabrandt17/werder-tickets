# Wird von der Windows-Aufgabenplanung aufgerufen. Schreibt ein Log nach logs\.
# Uebernimmt vorher genau den Stand von GitHub, damit Code-Aenderungen automatisch ankommen.
# reset statt pull: klappt auch nach umgeschriebener Historie. Lokal entsteht nur
# data/events.json, und das wird bei jedem Lauf neu erzeugt.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force logs | Out-Null
$log = Join-Path 'logs' ("{0:yyyy-MM}.log" -f (Get-Date))

$lockBefore = (Get-FileHash package-lock.json).Hash
& git fetch --quiet origin *>> $log
if ($LASTEXITCODE -eq 0) { & git reset --hard --quiet origin/main *>> $log }
if ((Get-FileHash package-lock.json).Hash -ne $lockBefore) {
    & npm ci --silent *>> $log
}

& node src/main.js *>> $log
exit $LASTEXITCODE
