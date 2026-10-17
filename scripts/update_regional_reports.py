"""Refresh Minnesota DNR park reports without turning ranges into exact percentages."""
import json, urllib.request, sys
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
URL='https://www.dnr.state.mn.us/data/export/fall-colors/all.json'
SOURCE='https://www.dnr.state.mn.us/fall_colors/index.html'
OUTPUT=Path(__file__).resolve().parents[1]/'data'/'regional-foliage.json'
PARKS={'SPK00172':('gooseberry',47.139,-91.469),'SPK00269':('tettegouche',47.347,-91.2),'SPK00181':('itasca',47.238,-95.207),'SPK00266':('splitrock',47.201,-91.366)}
BANDS={'1':('0–10%',0,10),'2':('10–25%',10,25),'3':('25–50%',25,50),'4':('50–75%',50,75),'5':('75–100%',75,100),'6':('Past peak',None,None)}
def extract(rows,retrieved):
    reports=[]
    for row in rows:
        if row.get('id') not in PARKS or row.get('leaves') not in BANDS:continue
        try:date=datetime.strptime(row['date'],'%m/%d/%Y').replace(hour=12,tzinfo=ZoneInfo('America/Chicago'))
        except (ValueError,KeyError):continue
        place,lat,lon=PARKS[row['id']];label,low,high=BANDS[row['leaves']]
        reports.append({'id':'MN:'+row['id'],'destinationId':place,'name':row['name'],'region':'MN','state':'MN','county':None,'lat':lat,'lon':lon,'percent':None,'percentLabel':label,'percentLow':low,'percentHigh':high,'pastPeak':row['leaves']=='6','condition':label,'peak':None,'reportedAt':date.isoformat(),'dateOnly':True,'retrievedAt':retrieved,'source':'Minnesota DNR','sourceUrl':SOURCE})
    if len(reports)<3:raise ValueError('Minnesota schema changed; previous snapshot retained')
    return {'retrievedAt':retrieved,'source':'Minnesota DNR','sourceUrl':SOURCE,'reports':reports}
def main():
    if len(sys.argv)==3 and sys.argv[1]=='--json':rows=json.loads(Path(sys.argv[2]).read_text())
    else:
        req=urllib.request.Request(URL,headers={'User-Agent':'StormVector nature guide (public park report attribution)'})
        with urllib.request.urlopen(req,timeout=30) as response:rows=json.load(response)
    output=extract(rows,datetime.now(timezone.utc).isoformat());OUTPUT.write_text(json.dumps(output,indent=2)+'\n');print('Saved',len(output['reports']),'Minnesota DNR park observations')
if __name__=='__main__':main()
