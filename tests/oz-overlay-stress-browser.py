"""Run the reusable release-overlay stress checks against synthetic source geometry."""
from browser_fixture import *
import importlib.util
spec=importlib.util.spec_from_file_location('nj_stress',ROOT/'scripts/live-nj-oz-stress.py');stress=importlib.util.module_from_spec(spec);spec.loader.exec_module(stress)
try:
 mode['nominationStress']=True
 with sync_playwright() as pw:report=stress.run_stress(pw,f'http://127.0.0.1:{server.server_port}/',network,True)
 assert report['passed']==report['total'],report
 print('NJ overlay stress browser suite passed:',report['total'],'synthetic checks; no live boundary verification claimed.')
finally:server.shutdown();server.server_close()
