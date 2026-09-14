$ErrorActionPreference = 'Stop'
$tokens=$null; $parseErrors=$null
$source=Join-Path $PSScriptRoot '../src/analyse/netzwerk_analyse.ps1'
$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors.Message -join '; ') }
# Nur reine Adressfunktionen laden. Dieser Test startet keine Netzaufnahme.
foreach ($name in @('Convert-IPv4ToNumber','Convert-NumberToIPv4','Get-ScanPlan')) {
    $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    . ([scriptblock]::Create($function.Extent.Text))
}
function Check($condition,$message) { if (-not $condition) {throw $message}; Write-Output "OK $message" }
$plan=Get-ScanPlan '10.20.0.0/16' '10.20.200.10' '' 254
Check ($plan.addresses -contains '10.20.200.10') 'Begrenzter Scan umfasst die lokale Adresse'
Check ($plan.selected -eq 254 -and $plan.omitted -eq 65280) 'Ausgelassene Adressen korrekt dokumentiert'
$plan=Get-ScanPlan '192.168.1.0/24' '' '192.168.1.250' 20
Check ($plan.selected -eq 5 -and $plan.last -eq '192.168.1.254') 'Bereich endet vor Broadcast'
$plan=Get-ScanPlan '10.0.0.0/31' '' '' 10
Check ($plan.selected -eq 2) '/31 umfasst beide Endpunkte'
$plan=Get-ScanPlan '10.0.0.7/32' '' '' 10
Check ($plan.selected -eq 1 -and $plan.first -eq '10.0.0.7') '/32 umfasst die Einzeladresse'
$plan=Get-ScanPlan '192.168.3.7/24' '' '' 254
Check ($plan.network -eq '192.168.3.0/24') 'Netzadresse normalisiert'
foreach($case in @(@('300.0.0.0/24',''),@('10.0.0.0/33',''),@('10.0.0.0/24','10.1.0.1'))) {
    $thrown=$false
    try { $null=Get-ScanPlan $case[0] '' $case[1] 10 } catch {$thrown=$true}
    Check $thrown ('Ungueltige Eingabe verworfen: '+$case[0]+' '+$case[1])
}
Check ((Convert-NumberToIPv4 (Convert-IPv4ToNumber '255.255.255.255')) -eq '255.255.255.255') 'UInt32-Grenze ohne Vorzeichenfehler'

# Den echten Ablauf mit Runspace-Pool, Abbruch und JSON ausfuehren.
# Netzwerkfunktionen und der gesamte Probe-Worker werden vorher ersetzt.
$mockSource = Get-Content -LiteralPath $source -Encoding UTF8 -Raw
$replacements = @{
    'Get-LocalNet' = "function Get-LocalNet { return @{Address='10.0.0.1';Prefix=30;Index=1;Name='Test';Gateway='10.0.0.1'} }"
    'Get-Neighbors' = "function Get-Neighbors { return @{'10.0.0.1'='00:11:22:33:44:55'} }"
    'Get-WifiInfo' = 'function Get-WifiInfo { return $null }'
}
foreach ($name in $replacements.Keys) {
    $node = $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name}, $true)
    if (-not $node) { throw "Mock-Ziel fehlt: $name" }
    $mockSource = $mockSource.Replace($node.Extent.Text, $replacements[$name])
}
$workerNode = $ast.Find({param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$worker'}, $true)
if (-not $workerNode) { throw 'Mock-Worker fehlt' }
$fakeWorker = '$worker = { param($Ip,$Source,$Wait,$PortList,$SkipPorts,$Mac) [pscustomobject]@{ip=$Ip;mac=$Mac;hostname=''test"host'';vendor='''';os='''';ping=$false;rtt=$null;ports=@();discovery=@(''tcp'')} }'
$mockSource = $mockSource.Replace($workerNode.Extent.Text, $fakeWorker)
$outputDirectory = Join-Path $PSScriptRoot 'output'
[void][System.IO.Directory]::CreateDirectory($outputDirectory)
$resultPath = Join-Path $outputDirectory 'scanner-windows-test.json'
& ([scriptblock]::Create($mockSource)) -Subnet '10.0.0.0/30' -Concurrency 2 -OutFile $resultPath
$result = Get-Content -LiteralPath $resultPath -Encoding UTF8 -Raw | ConvertFrom-Json
Check ($result.scan.completed -eq 2 -and -not $result.scan.cancelled -and $result.hosts.Count -eq 2) 'Runspace-Ablauf schreibt vollstaendiges JSON'
Check ($result.hosts[0].hostname -eq 'test"host' -and $result.links.Count -eq 1) 'JSON-Zitate und passende Gateway-Verbindung erhalten'
& ([scriptblock]::Create($mockSource)) -Subnet '10.0.1.0/30' -Concurrency 2 -OutFile $resultPath
$result = Get-Content -LiteralPath $resultPath -Encoding UTF8 -Raw | ConvertFrom-Json
Check (-not $result.gateway -and $result.links.Count -eq 0) 'Fremdes Netz erhaelt keine lokalen Gateway-Links'
$cancelSource = $mockSource.Replace($fakeWorker, '$worker = { Start-Sleep -Seconds 4 }')
& ([scriptblock]::Create($cancelSource)) -Subnet '10.0.0.0/30' -CancelAfterSeconds 1 -OutFile $resultPath
$result = Get-Content -LiteralPath $resultPath -Encoding UTF8 -Raw | ConvertFrom-Json
Check ($result.scan.cancelled -and $result.scan.completed -eq 0) 'Kontrollierter Abbruch schreibt Teilergebnis'
$errorSource = $mockSource.Replace($fakeWorker, '$worker = { Write-Error ''Simulierter Workerfehler'' }')
& ([scriptblock]::Create($errorSource)) -Subnet '10.0.0.0/30' -OutFile $resultPath
$result = Get-Content -LiteralPath $resultPath -Encoding UTF8 -Raw | ConvertFrom-Json
Check ($result.scan.cancelled -and $result.scan.error -match 'Simulierter Workerfehler') 'Workerfehler bleibt im Teilergebnis sichtbar'
