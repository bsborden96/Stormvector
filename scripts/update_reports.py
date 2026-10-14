"""Refresh public foliage observations. Standard library only; no build step.
Facts are extracted from Travel Wisconsin's public report, with attribution.
Never infer color percentages when a source fails or changes its schema.
"""
import json, re, urllib.request, sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

URL = 'https://www.travelwisconsin.com/fall-color-report'
OUTPUT = Path(__file__).resolve().parents[1] / 'data' / 'fall-reports.json'

class ReportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'aui-card' and 'data-filter-percent-to-peak' in attrs:
            self.current = {'attrs': attrs, 'text': []}

    def handle_data(self, text):
        if self.current:
            self.current['text'].append(text.strip())

    def handle_endtag(self, tag):
        if tag != 'aui-card' or not self.current:
            return
        a = self.current['attrs']
        text = ' '.join(filter(None, self.current['text']))
        self.current = None
        updated = re.search(r'Updated:\s*(\d{1,2}/\d{1,2}/\d{2}\s+\d{1,2}:\d{2}\s+[AP]M)', text)
        peak = re.search(r'Peak Color Forecast:\s*([^<]+?)(?:\s+Updated:|$)', text)
        try:
            percent = float(a['data-filter-percent-to-peak'])
            lat, lon = float(a['data-latitude']), float(a['data-longitude'])
            if not 0 <= percent <= 100 or not 40 < lat < 49 or not -95 < lon < -85 or not updated:
                return
            timestamp = datetime.strptime(updated[1], '%m/%d/%y %I:%M %p').replace(tzinfo=ZoneInfo('America/Chicago')).isoformat()
            self.rows.append({'id': a.get('data-id'), 'name': a.get('data-title'),
                'county': a.get('data-county', '').replace(' County', ''), 'state': 'WI',
                'lat': lat, 'lon': lon, 'percent': percent, 'condition': a.get('data-condition', ''),
                'peak': peak[1].strip() if peak else None, 'reportedAt': timestamp})
        except (KeyError, ValueError):
            return

def extract(html):
    parser = ReportParser()
    parser.feed(html)
    # Schema drift must not silently publish an empty or badly truncated report.
    if len(parser.rows) < 50:
        raise ValueError('Too few valid foliage reports; keeping the previous snapshot')
    return parser.rows

def main():
    # --html supports repeatable offline fixture testing and the initial verified fetch.
    if len(sys.argv) == 3 and sys.argv[1] == '--html':
        html = Path(sys.argv[2]).read_text()
    else:
        request = urllib.request.Request(URL, headers={'User-Agent': 'StormVector-NatureGuide/1.0 (public foliage report attribution)'})
        with urllib.request.urlopen(request, timeout=30) as response:
            html = response.read().decode('utf-8')
    rows = extract(html)
    output = {'source': 'Travel Wisconsin', 'sourceUrl': URL,
        'retrievedAt': datetime.now(timezone.utc).isoformat(), 'reports': rows,
        'coverage': {'WI': 'Reported observations', 'MN': 'Current foliage feed not connected', 'MI': 'Current foliage feed not connected'}}
    OUTPUT.write_text(json.dumps(output, indent=2) + '\n')
    print(f'Saved {len(rows)} attributed Wisconsin reports')

if __name__ == '__main__':
    main()
