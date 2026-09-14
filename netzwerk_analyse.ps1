<#
Bestandsaufnahme V6, Windows PowerShell 5.1 / PowerShell 7.
.\netzwerk_analyse.ps1 -Subnet 192.168.10.0/24 -InterfaceIndex 12
.\netzwerk_analyse.ps1 -PlanOnly
.\netzwerk_analyse.ps1 -Subnet 10.0.0.0/16 -StartAddress 10.0.20.1 -MaxHosts 254
Q beendet mit Teilergebnis. Nur eigene/freigegebene Netze scannen.
Keine Anmeldung oder Konfigurationsaenderung an den erkannten Geraeten.
#>
[CmdletBinding()]
param(
    [string]$Subnet = '', [int]$InterfaceIndex = 0, [string]$StartAddress = '',
    [ValidateRange(50,10000)][int]$Timeout = 400,
    [ValidateRange(1,65536)][int]$MaxHosts = 1024,
    [ValidateRange(1,64)][int]$Concurrency = 16,
    [ValidateRange(0,86400)][int]$CancelAfterSeconds = 0,
    [switch]$NoPorts, [switch]$PlanOnly, [switch]$ListInterfaces,
    [string]$OutFile = 'netzwerk_scan.json'
)
$ErrorActionPreference = 'Stop'
function Convert-IPv4ToNumber([string]$Address) {
    if ($Address -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'Ungueltige IPv4-Adresse.' }
    $n = [long]0
    foreach ($part in $Address.Split('.')) {
        if ([int]$part -gt 255) { throw 'Ungueltiges IPv4-Oktett.' }
        $n = $n * 256 + [int]$part
    }
    return $n
}
function Convert-NumberToIPv4([long]$Value) {
    return (@(24,16,8,0) | ForEach-Object { [math]::Floor($Value / [math]::Pow(2,$_)) % 256 }) -join '.'
}
function Get-ScanPlan([string]$Cidr, [string]$LocalAddress, [string]$Start, [int]$Limit) {
    if ($Cidr -notmatch '^([^/]+)/(\d{1,2})$') { throw 'Subnetz als IPv4/Prefix angeben.' }
    $addressText=$Matches[1]; $prefix=[int]$Matches[2]
    $ip = Convert-IPv4ToNumber $addressText
    if ($prefix -gt 32) { throw 'Prefix muss zwischen 0 und 32 liegen.' }
    $size = [long][math]::Pow(2,32-$prefix)
    $network = [long]([math]::Floor($ip / $size) * $size)
    $first = $network; $last = $network + $size - 1
    if ($prefix -lt 31) { $first++; $last-- }
    $total = $last - $first + 1
    if ($Limit -lt 1) { throw 'MaxHosts muss positiv sein.' }
    if ($Start) {
        $begin = Convert-IPv4ToNumber $Start
        if ($begin -lt $first -or $begin -gt $last) { throw 'Startadresse liegt ausserhalb des nutzbaren Bereichs.' }
    } else {
        $begin = $first
        if ($LocalAddress -and $total -gt $Limit) {
            $localNumber = Convert-IPv4ToNumber $LocalAddress
            if ($localNumber -ge $first -and $localNumber -le $last) {
                $begin = [long][math]::Max($first, [math]::Min($last-$Limit+1, $localNumber-[math]::Floor($Limit/2)))
            }
        }
    }
    $end = [long][math]::Min($last, $begin+$Limit-1)
    $addresses = New-Object 'System.Collections.Generic.List[string]'
    for ($n=$begin; $n -le $end; $n++) { $addresses.Add((Convert-NumberToIPv4 $n)) }
    return [pscustomobject]@{ network=((Convert-NumberToIPv4 $network)+"/$prefix"); first=(Convert-NumberToIPv4 $begin)
        last=(Convert-NumberToIPv4 $end); total=$total; selected=$addresses.Count; omitted=($total-$addresses.Count); addresses=$addresses.ToArray() }
}
function Get-LocalNet([int]$Index) {
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
    if (-not $Index) {
        $route = $routes | Sort-Object @{Expression={ $_.RouteMetric + (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4).InterfaceMetric }} | Select-Object -First 1
        if ($route) { $Index = $route.InterfaceIndex }
    }
    $all = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' })
    $local = $all | Where-Object { -not $Index -or $_.InterfaceIndex -eq $Index } | Select-Object -First 1
    if (-not $local) { throw 'Keine passende IPv4-Schnittstelle gefunden. -InterfaceIndex angeben.' }
    $gateway = $routes | Where-Object { $_.InterfaceIndex -eq $local.InterfaceIndex } | Sort-Object RouteMetric | Select-Object -First 1
    return @{ Address=$local.IPAddress; Prefix=$local.PrefixLength; Index=$local.InterfaceIndex; Name=$local.InterfaceAlias; Gateway=$gateway.NextHop }
}
function Get-Neighbors([int]$Index) {
    $map = @{}
    Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex $Index -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.State -in @('Reachable','Stale','Delay','Probe','Permanent') -and $_.LinkLayerAddress -match '^([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}$' -and $_.LinkLayerAddress -notmatch '^(00[:-]){5}00$|^(FF[:-]){5}FF$') {
            $map[$_.IPAddress] = $_.LinkLayerAddress.ToUpper().Replace('-',':')
        }
    }
    return $map
}
function Get-WifiInfo([string]$InterfaceName) {
    $process = New-Object System.Diagnostics.Process
    try {
        $process.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
        $process.StartInfo.FileName = 'netsh.exe'
        $process.StartInfo.Arguments = 'wlan show interfaces'
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardOutput = $true
        [void]$process.Start()
        $reading = $process.StandardOutput.ReadToEndAsync()
        if (-not $process.WaitForExit(2000)) { $process.Kill(); return $null }
        $selected = $false; $ssid = ''; $bssid = ''
        foreach ($line in ($reading.Result -split '\r?\n')) {
            if ($line -match '^\s*Name\s*:\s*(.+)$') { $selected = $Matches[1].Trim() -eq $InterfaceName }
            if ($selected -and $line -match '^\s*SSID\s*:\s*(.+)$') { $ssid = $Matches[1].Trim() }
            if ($selected -and $line -match '^\s*BSSID\s*:\s*(.+)$') { $bssid = $Matches[1].Trim().ToUpper().Replace('-', ':') }
        }
        if ($ssid -or $bssid) { return [pscustomobject]@{ssid=$ssid;bssid=$bssid} }
    } catch { return $null }
    finally { $process.Dispose() }
    return $null
}
if ($ListInterfaces) { Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceIndex,InterfaceAlias,IPAddress,PrefixLength; return }
$local = Get-LocalNet $InterfaceIndex
if (-not $Subnet) { $Subnet = "$($local.Address)/$($local.Prefix)" }
if ($Subnet -notmatch '/') { $Subnet += '/24' }
$plan = Get-ScanPlan $Subnet $local.Address $StartAddress $MaxHosts
if ($PlanOnly) { $plan | Select-Object network,first,last,total,selected,omitted | ConvertTo-Json; return }
Write-Host "Schnittstelle: $($local.Name) ($($local.Address)); Bereich: $($plan.first) - $($plan.last)"
Write-Host "Ausgelassen: $($plan.omitted); Parallelitaet: $Concurrency. Q beendet mit Teilergebnis."
$ports = @(22,53,80,443,445,515,554,631,1883,3306,3389,5000,5001,8000,8080,8443,8883,9100,1234,2560,12080,12090,15471)
$worker = {
    param($Ip,$Source,$Wait,$PortList,$SkipPorts,$Mac)
    function Tcp([int]$Port) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($Source),0)))
            $task = $client.ConnectAsync($Ip,$Port)
            return ($task.Wait($Wait) -and $client.Connected)
        } catch { return $false } finally { $client.Dispose() }
    }
    $reply = (& ping.exe -n 1 -w $Wait -S $Source $Ip 2>$null) -join ' '
    $ping = $reply -match 'TTL='
    $open = New-Object 'System.Collections.Generic.List[object]'
    if (-not $SkipPorts) {
        $probe = if ($ping -or $Mac -or $Ip -eq $Source) { $PortList } else { @(80,443,22,445,1883,3389,8080,9100) }
        foreach ($port in $probe) { if (Tcp $port) { $open.Add([pscustomobject]@{port=$port;proto='tcp';service=''}) } }
        if ($open.Count -and -not $ping -and -not $Mac -and $Ip -ne $Source) {
            foreach ($port in $PortList) { if ($port -notin $probe -and (Tcp $port)) { $open.Add([pscustomobject]@{port=$port;proto='tcp';service=''}) } }
        }
    }
    if (-not $ping -and -not $Mac -and -not $open.Count -and $Ip -ne $Source) { return }
    $name = ''
    try { $dns = [System.Net.Dns]::GetHostEntryAsync($Ip); if ($dns.Wait($Wait)) { $name=$dns.Result.HostName } } catch {}
    $methods = @(); if ($ping) {$methods+='icmp'}; if ($Mac) {$methods+='arp'}; if ($open.Count) {$methods+='tcp'}; if ($Ip -eq $Source) {$methods+='local'}
    [pscustomobject]@{ip=$Ip;mac=$Mac;hostname=$name;vendor='';os='';ping=$ping;rtt=$null;ports=@($open.ToArray());discovery=$methods}
}
$pool = [runspacefactory]::CreateRunspacePool(1,$Concurrency); $pool.Open()
$pending = New-Object 'System.Collections.Generic.List[object]'
$hosts = New-Object 'System.Collections.Generic.List[object]'
$completed = New-Object 'System.Collections.Generic.List[string]'
$neighbors = Get-Neighbors $local.Index
$clock = [diagnostics.stopwatch]::StartNew()
$next=0; $cancelled=$false; $scanError=''
try {
    while ($next -lt $plan.addresses.Count -or $pending.Count) {
        if ($CancelAfterSeconds -and $clock.Elapsed.TotalSeconds -ge $CancelAfterSeconds) { $cancelled=$true; break }
        try { if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq 'Q') { $cancelled=$true; break } } catch {}
        while ($next -lt $plan.addresses.Count -and $pending.Count -lt $Concurrency) {
            $ip=$plan.addresses[$next]; $next++
            $ps=[powershell]::Create(); $ps.RunspacePool=$pool
            [void]$ps.AddScript($worker).AddArgument($ip).AddArgument($local.Address).AddArgument($Timeout).AddArgument($ports).AddArgument([bool]$NoPorts).AddArgument([string]$neighbors[$ip])
            $pending.Add(@{PowerShell=$ps;Handle=$ps.BeginInvoke();Ip=$ip})
        }
        foreach ($job in @($pending.ToArray())) {
            if (-not $job.Handle.IsCompleted) { continue }
            try {
                foreach ($h in $job.PowerShell.EndInvoke($job.Handle)) { $hosts.Add($h) }
                if ($job.PowerShell.HadErrors) { throw ('Pruefung von ' + $job.Ip + ': ' + $job.PowerShell.Streams.Error[0]) }
                $completed.Add($job.Ip)
            }
            finally { $job.PowerShell.Dispose(); [void]$pending.Remove($job) }
        }
        Write-Progress -Activity 'Bestandsaufnahme' -Status "$($completed.Count) / $($plan.selected)" -PercentComplete (100*$completed.Count/$plan.selected)
        Start-Sleep -Milliseconds 30
    }
} catch { $scanError=$_.Exception.Message; $cancelled=$true }
finally {
    if ($completed.Count -lt $plan.selected) { $cancelled=$true }
    foreach ($job in @($pending.ToArray())) { try { $job.PowerShell.Stop(); $job.PowerShell.Dispose() } catch {} }
    $pool.Close(); $pool.Dispose()
    $neighbors = Get-Neighbors $local.Index
    foreach ($h in $hosts) { if ($neighbors.ContainsKey($h.ip)) { $h.mac=$neighbors[$h.ip]; if ('arp' -notin $h.discovery) {$h.discovery+= 'arp'} } }
    foreach ($ip in $completed) {
        if ($neighbors.ContainsKey($ip) -and -not @($hosts | Where-Object {$_.ip -eq $ip}).Count) {
            $hosts.Add([pscustomobject]@{ip=$ip;mac=$neighbors[$ip];hostname='';vendor='';os='';ping=$false;rtt=$null;ports=@();discovery=@('arp')})
        }
    }
    $links=New-Object 'System.Collections.Generic.List[object]'
    $localPlan=Get-ScanPlan "$($local.Address)/$($local.Prefix)" '' '' 1
    $gateway = if ($plan.network -eq $localPlan.network) { [string]$local.Gateway } else { '' }
    if ($gateway -and @($hosts | Where-Object {$_.ip -eq $gateway}).Count) {
        foreach ($h in $hosts) {
            if ($h.ip -ne $gateway) {
                $method=if ($h.mac) {'arp'} else {'same-subnet'}
                $links.Add([pscustomobject]@{source=$gateway;target=$h.ip;type='logical';method=$method;confidence=0.4;description='Gleiches lokales IP-Netz; physische Verkabelung nicht verifiziert.'})
            }
        }
    }
    $result=[ordered]@{tool='nwt-scan';version=6;generated=(Get-Date).ToString('o');scannedFrom=$env:COMPUTERNAME
        interface=$local.Name;interfaceIndex=$local.Index;localAddress=$local.Address;subnets=@($plan.network);gateway=$gateway;wifi=(Get-WifiInfo $local.Name)
        scan=[ordered]@{first=$plan.first;last=$plan.last;total=$plan.total;selected=$plan.selected;omitted=$plan.omitted;completed=$completed.Count;completedAddresses=$completed.ToArray();cancelled=$cancelled;error=$scanError;timeoutMs=$Timeout;concurrency=$Concurrency}
        hosts=$hosts.ToArray();links=$links.ToArray()}
    $outputPath=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
    $json=$result | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($outputPath,$json,(New-Object System.Text.UTF8Encoding($false)))
    Write-Progress -Activity 'Bestandsaufnahme' -Completed
    Write-Host "Ergebnis: $outputPath ($($hosts.Count) Hosts; $($completed.Count) Adressen abgeschlossen; Teilscan: $cancelled)"
}
