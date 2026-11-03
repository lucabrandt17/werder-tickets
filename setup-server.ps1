# Einmalige Einrichtung auf einem Windows-Server (per RDP als normaler Benutzer ausfuehren).
#
#   1. Prueft Node, Git und Edge/Chrome
#   2. Klont das Repo (oder aktualisiert es)
#   3. TESTET ZUERST, ob werder.de von diesem Server aus erreichbar ist
#   4. Meldet Git einmalig bei GitHub an (lucabrandt17)
#   5. Richtet die geplante Aufgabe ein (auch wenn niemand angemeldet ist)
#
# Aufruf:
#   powershell -ExecutionPolicy Bypass -File setup-server.ps1 [-Dir C:\werder-tickets]
param(
    [string]$Dir = 'C:\werder-tickets',
    [string[]]$Times = @('07:30', '18:00'),
    [string]$Repo = 'https://github.com/lucabrandt17/werder-tickets.git',
    [string]$GitHubUser = 'lucabrandt17'
)
$ErrorActionPreference = 'Stop'
$TaskName = 'Werder Ticket-Fristen'

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Green }
function Fail($text) { Write-Host "`nFEHLER: $text" -ForegroundColor Red; exit 1 }

# --- 1. Voraussetzungen -------------------------------------------------------
Step 'Pruefe Voraussetzungen'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Node.js fehlt. Bitte LTS installieren: https://nodejs.org (danach PowerShell neu oeffnen).' }
$nodeMajor = [int]((& node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Fail "Node $nodeMajor ist zu alt, mindestens 18 noetig." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'Git fehlt. Bitte installieren: https://git-scm.com/download/win' }
$browsers = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ }
if (-not $browsers) { Fail 'Weder Edge noch Chrome gefunden. Bitte Edge installieren: https://www.microsoft.com/edge/business/download' }
Write-Host "Node $(node -v), $(git --version), Browser: $($browsers[0])"

# --- 2. Repo holen ------------------------------------------------------------
Step "Hole Projekt nach $Dir"
if (Test-Path (Join-Path $Dir '.git')) {
    git -C $Dir pull --ff-only
} else {
    git clone $Repo $Dir
}
if ($LASTEXITCODE -ne 0) { Fail 'git clone/pull fehlgeschlagen.' }
Set-Location $Dir
npm ci --silent
if ($LASTEXITCODE -ne 0) { Fail 'npm ci fehlgeschlagen.' }

# --- 3. Abruftest -------------------------------------------------------------
Step 'Teste, ob werder.de von diesem Server aus lesbar ist (dauert ein paar Sekunden)'
node src/main.js --no-push
if ($LASTEXITCODE -ne 0) {
    Fail ('Der Abruf hat nicht geklappt (siehe Meldung oben). Wenn dort "Bot-Schutz" steht, blockt werder.de ' +
          'die IP dieses Servers. Dann bitte NICHT weiter einrichten, der Job bleibt auf dem PC.')
}
git checkout -- data docs   # Testlauf soll nichts veraendern
Write-Host 'Abruf funktioniert.' -ForegroundColor Green

# --- 4. GitHub-Anmeldung ------------------------------------------------------
Step "Git fuer GitHub-Konto $GitHubUser einrichten"
git config user.name 'Werder Fristen Bot'
git config user.email "$GitHubUser@users.noreply.github.com"
git config credential.https://github.com.username $GitHubUser
git remote set-url origin ($Repo -replace '^https://', "https://$GitHubUser@")
Write-Host 'Jetzt kann sich ein GitHub-Anmeldefenster oeffnen. Bitte als' $GitHubUser 'anmelden.' -ForegroundColor Yellow
git push --dry-run origin main
if ($LASTEXITCODE -ne 0) { Fail 'GitHub-Anmeldung/Push-Test fehlgeschlagen.' }
Write-Host 'Push-Rechte ok.' -ForegroundColor Green

# --- 5. Geplante Aufgabe ------------------------------------------------------
Step "Richte Aufgabe '$TaskName' ein ($($Times -join ' und ') Uhr)"
Write-Host 'Damit der Job auch laeuft, wenn niemand per RDP angemeldet ist, braucht Windows einmal das' -ForegroundColor Yellow
Write-Host 'Passwort dieses Benutzers. Es wird nur an die Aufgabenplanung uebergeben.' -ForegroundColor Yellow
$user = "$env:USERDOMAIN\$env:USERNAME"
$cred = Get-Credential -UserName $user -Message "Windows-Passwort fuer $user"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Dir\run.ps1`"" `
    -WorkingDirectory $Dir
$triggers = $Times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force `
    -Description "Liest werder.de Bestellfristen und aktualisiert den Kalender ($Dir)" | Out-Null

Step 'Starte die Aufgabe einmal zum Test'
Start-ScheduledTask -TaskName $TaskName
do { Start-Sleep 3 } while ((Get-ScheduledTask -TaskName $TaskName).State -eq 'Running')
$result = (Get-ScheduledTaskInfo -TaskName $TaskName).LastTaskResult
Get-ChildItem logs\*.log | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content -Tail 6
if ($result -ne 0) { Fail "Aufgabe endete mit Code $result (Log siehe oben)." }

Write-Host "`nFertig! Der Job laeuft jetzt taeglich um $($Times -join ' und ') Uhr auf diesem Server." -ForegroundColor Green
Write-Host 'Gib Claude Bescheid, dann wird die Aufgabe auf dem PC entfernt.' -ForegroundColor Green
