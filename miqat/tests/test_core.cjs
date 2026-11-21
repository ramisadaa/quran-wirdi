const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), cp = require('node:child_process');
const root = path.join(__dirname, '..');
const storage = new Map(); let blocked = false;
const context = vm.createContext({ window: { dispatchEvent() {}, addEventListener() {} }, localStorage: {
  getItem: key => storage.get(key) ?? null, setItem: (key,value) => { if (blocked) throw Error('blocked'); storage.set(key,value); }
}, Date, Intl, URL, AbortController, fetch: () => { throw Error('No network allowed'); }, setTimeout, clearTimeout, CustomEvent: class { constructor(type,data) { this.type = type; this.detail = data.detail; } } });
context.window.adhan = require(path.join(root, 'assets/vendor/adhan-4.4.6.min.js'));
for (const file of ['app-core.js', 'prayer-core.js', 'calendar-core.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
const app = context.window.Dashboard, clock = context.window.PrayerClock, cal = context.window.CalendarClock;
const place = { latitude:31.5, longitude:34.47, timezone:'Asia/Hebron', method:3, label:'غزة' };
const day = clock.calculateDay(place, '2026-11-04');
if (process.argv.includes('--time-probe')) { console.log(JSON.stringify(day.times)); process.exit(0); }
assert.equal(clock.dateKey(Date.parse('2026-11-03T22:30Z'), place.timezone), '2026-11-04');
assert.equal(clock.addDay('2024-02-28'),'2024-02-29'); assert.equal(clock.addDay('2026-12-31'),'2027-01-01');
assert.equal(clock.timeLabel(day.times.Fajr,place.timezone),'04:38'); assert.equal(clock.timeLabel(day.times.Maghrib,place.timezone),'16:51');
assert.deepEqual(Object.values(day.times).slice().sort((a,b)=>a-b),Object.values(day.times));
const tomorrow = clock.calculateDay(place, clock.addDay(day.date));
assert.equal(clock.nextPrayer([day,tomorrow],day.times.Isha+1).key,'Fajr');
assert.equal(clock.nextPrayer([day],day.times.Fajr).key,'Dhuhr');
assert.equal(clock.remaining(60001,0),'00:01:01'); assert.equal(clock.remaining(0,1000),'00:00:00');
assert.throws(()=>clock.normalizeDay({meta:{timezone:'bad-zone'},timings:{}}));
for (const method of [3,4,5]) for (const date of ['2026-03-08','2026-10-25','2026-12-31']) {
  const value = clock.calculateDay({...place,method},date); assert.equal(value.date,date); assert(Object.values(value.times).every(Number.isFinite));
}
const before=cal.describe(day.times.Maghrib-1,place.timezone,0,true,day.times.Maghrib);
const after=cal.describe(day.times.Maghrib,place.timezone,0,true,day.times.Maghrib);
assert.notEqual(before.day,after.day); assert.equal(before.gregorian,after.gregorian); assert(!before.advanced&&after.advanced);
const offset=cal.describe(day.times.Maghrib-1,place.timezone,1,false);
assert.equal(offset.day,after.day); assert(before.gregorian.includes('تشرين الثاني'));
for(let i=1;i<=30;i++){const moon=cal.moonPhase(i);assert(!moon.path.includes('NaN'));assert(moon.path.startsWith('M22'));assert(moon.name);}
assert(app.validLocation(place)); assert(!app.validLocation({...place,timezone:'bad'})); assert.throws(()=>app.emit('typo',null));
blocked=true; assert.equal(app.setLocation(place),false);assert.equal(app.getLocation().label,'غزة');
for(const timezone of ['UTC','America/New_York','Pacific/Honolulu']) {
 const times=JSON.parse(cp.execFileSync(process.execPath,[__filename,'--time-probe'],{env:{...process.env,TZ:timezone},encoding:'utf8'}));
 assert.deepEqual(times,JSON.parse(JSON.stringify(day.times)),'Prayer instants must not depend on device timezone: '+timezone);
}
console.log('PASS: local prayer calculation, after-Isha and exact boundaries, DST/calendar rollovers, Hijri offsets/sunset, Gregorian locale, 30 moon phases, validated events/location and device-timezone independence.');
