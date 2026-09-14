#!/usr/bin/env bash
# Bestandsaufnahme V6 fuer Linux/macOS. Python 3.9+ (nur Standardbibliothek)
# sowie ping und ip (Linux) bzw. ifconfig/route/arp (macOS) erforderlich.
# ./netzwerk_analyse.sh 192.168.10.0/24 --interface eth0 --max-hosts 254
# ./netzwerk_analyse.sh --plan-only
# Ctrl+C schreibt den abgeschlossenen Teil als JSON. Nur freigegebene Netze scannen.
set -eu
command -v python3 >/dev/null 2>&1 || { echo 'Python 3.9+ wird fuer dieses Analyseskript benoetigt.' >&2; exit 1; }
exec python3 - "$@" <<'PY_NWT'
import argparse
import concurrent.futures as futures
import datetime
import ipaddress
import json
import math
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time

PORTS = [22,53,80,443,445,515,554,631,1883,3306,3389,5000,5001,8000,8080,8443,8883,9100,1234,2560,12080,12090,15471]
PROBE_PORTS = [80,443,22,445,1883,3389,8080,9100]

def command(argv, timeout=2):
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return result.stdout if result.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''

def scan_plan(cidr, local='', start='', limit=1024):
    network = ipaddress.IPv4Network(cidr, strict=False)
    if limit < 1:
        raise ValueError('max-hosts muss positiv sein')
    first, last = int(network.network_address), int(network.broadcast_address)
    if network.prefixlen < 31:
        first += 1
        last -= 1
    total = last - first + 1
    begin = int(ipaddress.IPv4Address(start)) if start else first
    if start and not first <= begin <= last:
        raise ValueError('Startadresse liegt ausserhalb des nutzbaren Bereichs')
    if not start and local and total > limit and ipaddress.IPv4Address(local) in network:
        begin = max(first, min(last-limit+1, int(ipaddress.IPv4Address(local))-limit//2))
    end = min(last, begin+limit-1)
    return dict(network=str(network), first=str(ipaddress.IPv4Address(begin)), last=str(ipaddress.IPv4Address(end)),
                total=total, selected=end-begin+1, omitted=total-(end-begin+1),
                addresses=[str(ipaddress.IPv4Address(n)) for n in range(begin, end+1)])

def local_net(interface=''):
    if sys.platform == 'darwin':
        route = command(['route','-n','get','default'])
        default = re.search(r'interface:\s*(\S+)', route)
        gateway = re.search(r'gateway:\s*([0-9.]+)', route)
        interface = interface or (default.group(1) if default else '')
        data = command(['ifconfig',interface])
        match = re.search(r'inet\s+([0-9.]+)\s+netmask\s+(0x[0-9a-f]+|[0-9.]+)', data)
        if not match:
            raise ValueError('Keine IPv4-Adresse fuer die Schnittstelle gefunden')
        mask = str(ipaddress.IPv4Address(int(match.group(2),16))) if match.group(2).startswith('0x') else match.group(2)
        prefix = ipaddress.IPv4Network('0.0.0.0/'+mask).prefixlen
        return dict(address=match.group(1), prefix=prefix, interface=interface,
                    gateway=gateway.group(1) if gateway and default and default.group(1) == interface else '')
    routes = json.loads(command(['ip','-j','-4','route','show','default']) or '[]')
    route = next((r for r in routes if not interface or r.get('dev') == interface), {})
    interface = interface or route.get('dev','')
    interfaces = json.loads(command(['ip','-j','-4','addr','show'] + (['dev',interface] if interface else [])) or '[]')
    for item in interfaces:
        for address in item.get('addr_info',[]):
            if address.get('family') == 'inet' and not ipaddress.IPv4Address(address['local']).is_loopback:
                return dict(address=address['local'], prefix=address['prefixlen'], interface=item['ifname'], gateway=route.get('gateway',''))
    raise ValueError('Keine passende IPv4-Schnittstelle gefunden; --interface angeben')

def neighbors(interface):
    if sys.platform != 'darwin':
        values = json.loads(command(['ip','-j','-4','neigh','show','dev',interface]) or '[]')
        pairs = [(v.get('dst',''),v.get('lladdr','')) for v in values if not set(v.get('state',[])) & {'FAILED','INCOMPLETE'}]
    else:
        text = command(['arp','-an','-i',interface])
        pairs = re.findall(r'\(([0-9.]+)\) at ([0-9a-f:]+)', text, re.I)
    result = {}
    for ip, mac in pairs:
        try:
            address = ipaddress.IPv4Address(ip)
            parts = mac.split(':')
            if len(parts) != 6 or address.is_multicast:
                continue
            normalized = ':'.join('%02X' % int(p,16) for p in parts)
            if normalized not in ('00:00:00:00:00:00','FF:FF:FF:FF:FF:FF'):
                result[ip] = normalized
        except ValueError:
            pass
    return result

def main():
    parser = argparse.ArgumentParser(description='Offline-Scan-Datei fuer das Netzwerktool erstellen')
    parser.add_argument('subnet', nargs='?', default='')
    parser.add_argument('--subnet', dest='subnet_option', default='', help='Zielnetz als IPv4/CIDR')
    parser.add_argument('--interface', default='')
    parser.add_argument('--start-address', default='')
    parser.add_argument('--max-hosts', type=int, default=1024)
    parser.add_argument('--timeout', type=int, default=400, help='Timeout in Millisekunden')
    parser.add_argument('--concurrency', type=int, default=16)
    parser.add_argument('--cancel-after-seconds', type=float, default=0)
    parser.add_argument('--no-ports', action='store_true')
    parser.add_argument('--plan-only', action='store_true')
    parser.add_argument('--out-file', default='netzwerk_scan.json')
    args = parser.parse_args()
    if args.subnet and args.subnet_option and args.subnet != args.subnet_option:
        parser.error('Zielnetz nur einmal angeben.')
    if not 1 <= args.max_hosts <= 65536 or not 1 <= args.concurrency <= 64 or not 50 <= args.timeout <= 10000 or args.cancel_after_seconds < 0:
        parser.error('Ungueltige Grenzen: Hosts 1..65536, Parallelitaet 1..64, Timeout 50..10000 ms')
    local = local_net(args.interface)
    subnet = args.subnet_option or args.subnet or (local['address']+'/'+str(local['prefix']))
    if subnet.count('.') == 2:
        subnet += '.0/24'
    elif '/' not in subnet:
        subnet += '/24'
    plan = scan_plan(subnet, local['address'], args.start_address, args.max_hosts)
    if args.plan_only:
        print(json.dumps({k:v for k,v in plan.items() if k != 'addresses'}, indent=2))
        return
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    timeout = args.timeout/1000
    initial = neighbors(local['interface'])
    def tcp(ip, port):
        if stop.is_set():
            return False
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client:
                client.settimeout(timeout)
                client.bind((local['address'],0))
                return client.connect_ex((ip,port)) == 0
        except OSError:
            return False
    def probe(ip):
        mac = initial.get(ip,'')
        ping_args = ['ping','-c','1','-W',str(args.timeout if sys.platform == 'darwin' else max(1,math.ceil(timeout))),
                     '-S' if sys.platform == 'darwin' else '-I',local['address'],ip]
        ping = bool(command(ping_args, max(1,timeout)+0.5))
        checked = PORTS if ping or mac or ip == local['address'] else PROBE_PORTS
        ports = [] if args.no_ports else [p for p in checked if tcp(ip,p)]
        if ports and checked is PROBE_PORTS:
            ports += [p for p in PORTS if p not in checked and tcp(ip,p)]
        name = ''
        if (ping or ports or mac) and not stop.is_set():
            dns = command(['nslookup',ip], timeout=max(0.5,timeout))
            match = re.search(r'name\s*=\s*([^\s]+)',dns,re.I)
            name = match.group(1).rstrip('.') if match else ''
        host = None
        if ping or mac or ports or ip == local['address']:
            methods = (['icmp'] if ping else []) + (['arp'] if mac else []) + (['tcp'] if ports else []) + (['local'] if ip == local['address'] else [])
            host = dict(ip=ip,mac=mac,hostname=name,vendor='',os='',ping=ping,rtt=None,
                        ports=[dict(port=p,proto='tcp',service='') for p in ports],discovery=methods)
        return host, not stop.is_set()
    hosts, completed = {}, []
    started = time.monotonic()
    pool = futures.ThreadPoolExecutor(max_workers=args.concurrency)
    pending, remaining = {}, iter(plan['addresses'])
    error = ''
    print('Bereich %s - %s; %s Adressen ausgelassen. Ctrl+C schreibt Teilergebnis.' % (plan['first'],plan['last'],plan['omitted']), file=sys.stderr)
    try:
        exhausted = False
        while not stop.is_set() and (pending or not exhausted):
            if args.cancel_after_seconds and time.monotonic()-started >= args.cancel_after_seconds:
                stop.set()
                break
            while len(pending) < args.concurrency and not exhausted:
                ip = next(remaining, None)
                if ip is None:
                    exhausted = True
                else:
                    pending[pool.submit(probe,ip)] = ip
            done, _ = futures.wait(pending, timeout=0.1, return_when=futures.FIRST_COMPLETED)
            for task in done:
                ip = pending.pop(task)
                host, finished = task.result()
                if host:
                    hosts[ip] = host
                if finished:
                    completed.append(ip)
    except Exception as exc:
        error = str(exc)
        stop.set()
    finally:
        if pending:
            stop.set()
        pool.shutdown(wait=True, cancel_futures=True)
        for task, ip in pending.items():
            if not task.cancelled() and task.done():
                try:
                    host, finished = task.result()
                    if host:
                        hosts[ip] = host
                    if finished:
                        completed.append(ip)
                except Exception:
                    pass
        final = neighbors(local['interface'])
        for ip in completed:
            if ip in final:
                host = hosts.setdefault(ip, dict(ip=ip,mac='',hostname='',vendor='',os='',ping=False,rtt=None,ports=[],discovery=[]))
                host['mac'] = final[ip]
                if 'arp' not in host['discovery']:
                    host['discovery'].append('arp')
        local_network = str(ipaddress.IPv4Network(local['address']+'/'+str(local['prefix']), strict=False))
        gateway = local['gateway'] if plan['network'] == local_network else ''
        links = [dict(source=gateway,target=ip,type='logical',method='arp' if h['mac'] else 'same-subnet',confidence=0.4,
                      description='Gleiches lokales IP-Netz; physische Verkabelung nicht verifiziert.')
                 for ip,h in hosts.items() if ip != gateway] if gateway in hosts else []
        scan = {k:v for k,v in plan.items() if k not in ('addresses','network')}
        scan.update(completed=len(completed),completedAddresses=completed,cancelled=len(completed)<plan['selected'],error=error,timeoutMs=args.timeout,concurrency=args.concurrency)
        result = dict(tool='nwt-scan',version=6,generated=datetime.datetime.now(datetime.timezone.utc).isoformat(),scannedFrom=socket.gethostname(),
                      interface=local['interface'],localAddress=local['address'],subnets=[plan['network']],gateway=gateway,wifi=None,scan=scan,
                      hosts=sorted(hosts.values(),key=lambda h:int(ipaddress.IPv4Address(h['ip']))),links=links)
        target = os.path.abspath(args.out_file)
        with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=os.path.dirname(target),delete=False) as output:
            json.dump(result,output,ensure_ascii=False,indent=2)
            temporary = output.name
        os.replace(temporary,target)
        print('Ergebnis: %s (%s Hosts; %s Adressen abgeschlossen)' % (target,len(hosts),len(completed)))

if __name__ == '__main__':
    main()
PY_NWT
