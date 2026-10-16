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
HISTORY = OUTPUT.with_name('fall-history.json')

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
            # Travel Wisconsin currently tags Delafield with Waushara. Its
            # coordinates and official Southern Savanna county guide place it in Waukesha.
            # https://www.travelwisconsin.com/pdf/southern-savanna-guide.pdf
            county = a.get('data-county', '').replace(' County', '')
            if a.get('data-title') == 'Delafield' and 43 < lat < 43.1 and -88.5 < lon < -88.3:
                county = 'Waukesha'
            self.rows.append({'id': a.get('data-id'), 'name': a.get('data-title'),
                'county': county, 'state': 'WI',
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

def merge_history(history, *snapshots):
    """Keep the last 14 real source retrievals; never synthesize a prior report."""
    found = {}
    for snapshot in list(history.get('snapshots', []) if isinstance(history, dict) else []) + list(snapshots):
        if not isinstance(snapshot, dict) or not snapshot.get('retrievedAt') or not isinstance(snapshot.get('reports'), list):
            continue
        try:
            retrieved = datetime.fromisoformat(snapshot['retrievedAt'].replace('Z', '+00:00'))
            if retrieved.tzinfo is None:
                continue
        except (ValueError, TypeError):
            continue
        keys = ('id', 'name', 'county', 'lat', 'lon', 'percent', 'reportedAt')
        found[retrieved.timestamp()] = {'retrievedAt': snapshot['retrievedAt'],
            'reports': [{key: row.get(key) for key in keys} for row in snapshot['reports']]}
    return {'source': 'Travel Wisconsin', 'sourceUrl': URL,
        'snapshots': [found[key] for key in sorted(found)[-14:]]}

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
    try:
        prior = json.loads(OUTPUT.read_text())
    except (OSError, ValueError):
        prior = {}
    try:
        history = json.loads(HISTORY.read_text())
    except (OSError, ValueError):
        history = {}
    archive = merge_history(history, prior, output)
    HISTORY.write_text(json.dumps(archive, indent=2) + '\n')
    OUTPUT.write_text(json.dumps(output, indent=2) + '\n')
    print(f'Saved {len(rows)} attributed Wisconsin reports')

if __name__ == '__main__':
    main()
