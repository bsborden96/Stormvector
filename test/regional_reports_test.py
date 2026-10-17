import unittest, importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('regional',Path(__file__).resolve().parents[1]/'scripts'/'update_regional_reports.py')
regional=importlib.util.module_from_spec(spec);spec.loader.exec_module(regional)
class Reports(unittest.TestCase):
    def test_ranges_and_past_peak_never_become_exact_percentages(self):
        rows=[{'id':id,'name':id,'date':'10/16/2026','leaves':'6' if i==0 else '5'} for i,id in enumerate(regional.PARKS)]
        result=regional.extract(rows,'2026-10-17T01:00:00Z')
        self.assertTrue(result['reports'][0]['pastPeak'])
        self.assertIsNone(result['reports'][0]['percent'])
        self.assertEqual(result['reports'][1]['percentLabel'],'75–100%')
        self.assertIsNone(result['reports'][1]['percent'])
        self.assertTrue(result['reports'][1]['dateOnly'])
    def test_changed_schema_preserves_existing_snapshot(self):
        with self.assertRaises(ValueError):regional.extract([{'leaves':'unknown'}],'2026-10-17T01:00:00Z')
