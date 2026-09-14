"""Tests des eingebetteten Linux/macOS-Scanners ohne Netzwerkzugriffe."""
import json
import io
import pathlib
import tempfile
import unittest
from unittest import mock

SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'src/analyse/netzwerk_analyse.sh'
code = SOURCE.read_text(encoding='utf-8').split("<<'PY_NWT'\n", 1)[1].rsplit('\nPY_NWT', 1)[0]
scanner = {'__name__': 'nwt_test'}
exec(compile(code, str(SOURCE), 'exec'), scanner)

class Socket:
    def __init__(self, *_):
        pass
    def __enter__(self):
        return self
    def __exit__(self, *_):
        pass
    def settimeout(self, *_):
        pass
    def bind(self, *_):
        pass
    def connect_ex(self, address):
        return 0 if address == ('10.0.0.2', 80) else 1

class ScanTests(unittest.TestCase):
    def test_named_subnet_plan_only(self):
        output = io.StringIO()
        local = dict(address='10.0.20.10', prefix=16, interface='test0', gateway='10.0.0.1')
        args = ['scanner', '--subnet', '10.0.0.0/16', '--start-address', '10.0.20.1', '--max-hosts', '254', '--plan-only']
        with mock.patch.dict(scanner, local_net=lambda _: local), mock.patch.object(scanner['sys'], 'argv', args), mock.patch('sys.stdout', output), mock.patch.object(scanner['socket'], 'socket', side_effect=AssertionError('PlanOnly darf nicht scannen')):
            scanner['main']()
        result = json.loads(output.getvalue())
        self.assertEqual(result['first'], '10.0.20.1')
        self.assertEqual(result['selected'], 254)

    def test_bounded_range(self):
        plan = scanner['scan_plan']('10.20.0.0/16', '10.20.200.10', limit=254)
        self.assertIn('10.20.200.10', plan['addresses'])
        self.assertEqual(plan['omitted'], 65280)
        self.assertEqual(scanner['scan_plan']('192.168.1.0/24', start='192.168.1.250', limit=20)['selected'], 5)

    def test_small_subnets_and_validation(self):
        self.assertEqual(scanner['scan_plan']('10.0.0.0/31')['selected'], 2)
        self.assertEqual(scanner['scan_plan']('10.0.0.7/32')['addresses'], ['10.0.0.7'])
        for cidr, start in [('300.0.0.0/24', ''), ('10.0.0.0/33', ''), ('10.0.0.0/24', '10.1.0.1')]:
            with self.assertRaises(ValueError):
                scanner['scan_plan'](cidr, start=start)

    def run_scan(self, extra=(), cancel=False, local_prefix=30):
        local = dict(address='10.0.0.1', prefix=local_prefix, interface='test0', gateway='10.0.0.1')
        with tempfile.TemporaryDirectory() as directory:
            output = pathlib.Path(directory) / 'result.json'
            args = ['scanner', '10.0.0.0/30', '--max-hosts', '2', '--timeout', '50', '--out-file', str(output), *extra]
            def command(argv, timeout=2):
                return 'name = test"host.example.' if argv[0] == 'nslookup' else ''
            with mock.patch.dict(scanner, local_net=lambda _: local, neighbors=lambda _: {'10.0.0.1':'00:11:22:33:44:55'}, command=command), \
                 mock.patch.object(scanner['sys'], 'argv', args), \
                 mock.patch.object(scanner['signal'], 'signal'), \
                 mock.patch.object(scanner['socket'], 'socket', Socket):
                if cancel:
                    with mock.patch.object(scanner['time'], 'monotonic', side_effect=[0, 2]):
                        scanner['main']()
                else:
                    scanner['main']()
            return json.loads(output.read_text(encoding='utf-8'))

    def test_tcp_without_ping_and_json_escaping(self):
        result = self.run_scan()
        host = next(h for h in result['hosts'] if h['ip'] == '10.0.0.2')
        self.assertFalse(host['ping'])
        self.assertIn('tcp', host['discovery'])
        self.assertEqual(host['hostname'], 'test"host.example')
        self.assertEqual(result['scan']['completed'], 2)
        self.assertFalse(result['scan']['cancelled'])
        self.assertEqual(len(result['links']), 1)

    def test_cancel_writes_partial_result(self):
        result = self.run_scan(['--cancel-after-seconds', '1'], cancel=True)
        self.assertTrue(result['scan']['cancelled'])
        self.assertEqual(result['scan']['completedAddresses'], [])

    def test_other_subnet_has_no_local_gateway_links(self):
        result = self.run_scan(local_prefix=24)
        self.assertEqual(result['gateway'], '')
        self.assertEqual(result['links'], [])

if __name__ == '__main__':
    unittest.main()
