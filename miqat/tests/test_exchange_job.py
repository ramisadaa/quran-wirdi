from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from contextlib import redirect_stdout
import copy, importlib.util, io, json, os, tempfile

source=Path(__file__).resolve().parents[1]/'tools/update_exchange_rates.py'
spec=importlib.util.spec_from_file_location('exchange_job',source);job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
config={'timezone':'Asia/Hebron','times':['08:15','13:15','18:15'],'maxDailyRequests':3,'maxMonthlyRequests':100,'usageAlreadyConsumed':0,'usageMonth':'2027-01','historyDays':7}
initial={'version':1,'latest':{'marker':'original'},'snapshots':[]}
os.environ['EXCHANGERATE_API_KEY']='TEST_KEY_NOT_REAL'
os.environ.pop('GITHUB_OUTPUT',None);os.environ.pop('EXCHANGE_RESERVATION_ID',None)

def setup(folder,settings=None):
 job.CONFIG=folder/'schedule.json';job.STATE=folder/'state.json';job.DATA=folder/'rates.json'
 job.write_json(job.CONFIG,settings or config)
 job.write_json(job.STATE,{'version':1,'month':'','monthAttempts':0,'days':{},'lastReservation':None,'blockedMonth':None})
 job.write_json(job.DATA,copy.deepcopy(initial))
def at(day,slot,month=1):return datetime(2027,month,day,int(slot[:2]),int(slot[3:]),tzinfo=ZoneInfo('Asia/Hebron'))
calls=[]
def ok_transport(key):
 assert key=='TEST_KEY_NOT_REAL';calls.append(key)
 return {'success':True,'source':'USD','timestamp':1793783700,'quotes':{'USDEUR':.89,'USDILS':3.17,'USDJOD':.709}}

with tempfile.TemporaryDirectory()as tmp,redirect_stdout(io.StringIO())as log:
 folder=Path(tmp);setup(folder)
 for day in range(1,32):
  for slot in config['times']:
   now=at(day,slot)
   assert job.reserve(now)
   assert not job.reserve(now) # Even before fetching: the reserved slot cannot repeat.
   assert job.fetch_reserved(now,ok_transport)
   assert job.fetch_reserved(now,ok_transport) # No second request for a finished reservation.
   assert not job.reserve(now)
 assert len(calls)==93
 state=job.read_json(job.STATE);assert state['monthAttempts']==93
 assert all(day['attempts']==3 for day in state['days'].values())
 assert len(job.read_json(job.DATA)['snapshots'])<=21
 assert 'TEST_KEY_NOT_REAL'not in job.DATA.read_text()and'TEST_KEY_NOT_REAL'not in job.STATE.read_text()
 assert 'TEST_KEY_NOT_REAL'not in log.getvalue()
 # Existing account usage is part of the monthly cap.
 setup(folder,{**config,'usageAlreadyConsumed':98});start=len(calls)
 for slot in config['times']:
  now=at(1,slot)
  if job.reserve(now):job.fetch_reserved(now,ok_transport)
 assert len(calls)-start==2 and job.read_json(job.STATE)['monthAttempts']==100
 # February gets its own allowance, but still only three unique daily slots.
 assert job.reserve(at(1,'08:15',month=2));job.fetch_reserved(at(1,'08:15',month=2),ok_transport)
 assert job.read_json(job.STATE)['monthAttempts']==1
 # Missing key cannot spend a reservation or make a request.
 setup(folder);os.environ.pop('EXCHANGERATE_API_KEY');assert not job.reserve(at(1,'08:15'))
 assert job.read_json(job.STATE)['monthAttempts']==0
 os.environ['EXCHANGERATE_API_KEY']='TEST_KEY_NOT_REAL'
 # Failed or timed-out calls consume their slot while preserving all previous prices.
 assert job.reserve(at(1,'08:15'))
 before=job.DATA.read_bytes()
 def timeout(_):raise TimeoutError('secret-bearing URL must not be logged')
 assert not job.fetch_reserved(at(1,'08:15'),timeout)
 assert job.DATA.read_bytes()==before and not job.reserve(at(1,'08:15'))
 # Quota rejection blocks the rest of the month immediately.
 setup(folder);assert job.reserve(at(1,'08:15'))
 def exhausted(_):raise job.ProviderFailure(104)
 assert not job.fetch_reserved(at(1,'08:15'),exhausted)
 assert not job.reserve(at(2,'08:15'))
 # Both common payload shapes normalize to USD quotes without another API request.
 value=job.normalize({'success':True,'base':'EUR','date':'2027-01-01','rates':{'USD':1.12,'EUR':1,'ILS':3.55,'JOD':.79}},at(1,'08:15'),'08:15')
 assert abs(value['quotes']['ILS']-3.55/1.12)<1e-10
 try:job.normalize({'source':'USD','timestamp':1793783700,'quotes':{'USDEUR':0,'USDILS':3,'USDJOD':.7}},at(1,'08:15'),'08:15')
 except job.ProviderFailure:pass
 else:raise AssertionError('Invalid rate accepted')
# Reject implausible or divergent account results while keeping the last published snapshot.
with tempfile.TemporaryDirectory() as tmp, redirect_stdout(io.StringIO()):
 folder=Path(tmp);setup(folder);assert job.reserve(at(1,'08:15'));assert job.fetch_reserved(at(1,'08:15'),ok_transport)
 good=job.DATA.read_bytes();assert job.reserve(at(1,'13:15'))
 def divergent(_):return {'source':'USD','timestamp':1793783700,'quotes':{'USDEUR':.89,'USDILS':4.5,'USDJOD':.709}}
 assert not job.fetch_reserved(at(1,'13:15'),divergent);assert job.DATA.read_bytes()==good
 assert job.reserve(at(1,'18:15'))
 def tiny(_):return {'source':'USD','timestamp':1793783700,'quotes':{'USDEUR':.89,'USDILS':3.17,'USDJOD':.0001}}
 assert not job.fetch_reserved(at(1,'18:15'),tiny);assert job.DATA.read_bytes()==good
# Explicit occurrences survive queue delay, re-runs and local-midnight boundaries.
with tempfile.TemporaryDirectory() as tmp, redirect_stdout(io.StringIO()):
 folder=Path(tmp);setup(folder)
 os.environ['GITHUB_EVENT_NAME']='schedule'
 os.environ['SCHEDULE_CRON']='15 8 * * *'
 os.environ['WORKFLOW_CREATED_AT']=job.utc_text(at(3,'08:15'))
 assert job.reserve(at(3,'13:30'))
 state=job.read_json(job.STATE)
 assert state['lastReservation']['slot']=='08:15' and state['lastReservation']['scheduledDate']=='2027-01-03'
 os.environ['SCHEDULE_CRON']='15 13 * * *';os.environ['WORKFLOW_CREATED_AT']=job.utc_text(at(3,'13:15'))
 assert job.reserve(at(3,'13:45'))
 os.environ['SCHEDULE_CRON']='15 18 * * *';os.environ['WORKFLOW_CREATED_AT']=job.utc_text(at(3,'18:15'))
 assert job.reserve(at(4,'00:30'))
 state=job.read_json(job.STATE);assert state['lastReservation']['scheduledDate']=='2027-01-03' and state['lastReservation']['date']=='2027-01-04'
 assert not job.reserve(at(4,'02:00'))
 assert not job.reserve(at(5,'04:00')) # Expired occurrence does not claim the new day's opening slot.
 os.environ['WORKFLOW_CREATED_AT']=job.utc_text(at(31,'18:15'))
 assert job.reserve(at(1,'00:30',month=2));assert job.read_json(job.STATE)['month']=='2027-02'
 for name in ['GITHUB_EVENT_NAME','SCHEDULE_CRON','WORKFLOW_CREATED_AT']:os.environ.pop(name,None)
print('PASS: 93 requests maximum over 31 full days; duplicates/manual re-runs blocked before and after fetch; existing usage respected; missing key makes zero calls; failures retain data; quota stops the month; secret never enters logs or JSON; payload schemas, 21-snapshot retention, delayed explicit slots, original re-run anchoring and midnight/month boundaries verified.')
