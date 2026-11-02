"""The CI runner must report failure while still executing every suite."""
import importlib.util,json,subprocess,tempfile,unittest,io
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('browser_runner',Path(__file__).resolve().parents[1]/'scripts'/'run-browser-tests.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class RunnerTests(unittest.TestCase):
 def test_failure_does_not_skip_later_suites(self):
  with tempfile.TemporaryDirectory() as d,patch.object(runner.subprocess,'run',side_effect=[SimpleNamespace(returncode=1),SimpleNamespace(returncode=0)]) as call,redirect_stdout(io.StringIO()):
   self.assertEqual(runner.run(['first','second'],d),1);self.assertEqual(call.call_count,2)
   rows=json.loads((Path(d)/'summary.json').read_text());self.assertEqual([r['exitCode'] for r in rows],[1,0]);self.assertTrue((Path(d)/'junit.xml').exists())
 def test_timeout_does_not_skip_later_suites(self):
  with tempfile.TemporaryDirectory() as d,patch.object(runner.subprocess,'run',side_effect=[subprocess.TimeoutExpired('first',240),SimpleNamespace(returncode=0)]) as call,redirect_stdout(io.StringIO()):
   self.assertEqual(runner.run(['first','second'],d),1);self.assertEqual(call.call_count,2)
   self.assertEqual(json.loads((Path(d)/'summary.json').read_text())[0]['exitCode'],124)
if __name__=='__main__':unittest.main()
