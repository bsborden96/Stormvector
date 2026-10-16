import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('reports', Path(__file__).resolve().parents[1] / 'scripts' / 'update_reports.py')
reports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reports)

class ReportParserTest(unittest.TestCase):
    def test_report_requires_observation_and_stable_schema(self):
        card = '<aui-card data-id="test" data-title="Madison" data-county="Dane County" data-latitude="43.0731" data-longitude="-89.4012" data-filter-percent-to-peak="55" data-condition="55% Color"><p>Peak Color Forecast: 3rd Week of October</p><p>Updated: 10/13/26 7:40 PM</p></aui-card>'
        with self.assertRaisesRegex(ValueError,'Too few'):
            reports.extract(card)
        result=reports.extract(card*50)
        self.assertEqual(len(result),50)
        self.assertEqual(result[0]['county'],'Dane')
        self.assertEqual(result[0]['peak'],'3rd Week of October')
        self.assertEqual(result[0]['reportedAt'],'2026-10-13T19:40:00-05:00')
        corrected=reports.extract(card.replace('data-title="Madison"','data-title="Delafield"').replace('Dane County','Waushara County').replace('43.0731','43.060796').replace('-89.4012','-88.406791')*50)
        self.assertEqual(corrected[0]['county'],'Waukesha')
        with self.assertRaisesRegex(ValueError,'Too few'):
            reports.extract(card.replace('data-filter-percent-to-peak="55"','data-filter-percent-to-peak="105"')*50)

    def test_history_retains_only_real_dated_snapshots_and_caps_at_fourteen(self):
        snapshots = [{'retrievedAt': f'2026-10-{i:02d}T15:00:00+00:00', 'reports': [{'id': 'a', 'percent': i}]} for i in range(1, 17)]
        history = reports.merge_history({}, *snapshots, {'retrievedAt': 'invalid', 'reports': []})
        self.assertEqual(len(history['snapshots']), 14)
        self.assertEqual(history['snapshots'][0]['reports'][0]['percent'], 3)
        same = reports.merge_history(history, snapshots[-1])
        self.assertEqual(len(same['snapshots']), 14)
        self.assertEqual(same['snapshots'][-1]['retrievedAt'], snapshots[-1]['retrievedAt'])

if __name__=='__main__':
    unittest.main()
