const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
async function setup(scope){
 const handlers={},stores=new Map();let online=false,networkCalls=0;
 const absolute=value=>new URL(typeof value==='string'?value:value.url,scope).href.split('?')[0];
 const caches={async keys(){return [...stores.keys()];},async delete(key){return stores.delete(key);},async open(name){
  if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);
  return{async addAll(files){for(const file of files)store.set(absolute(file),new Response('offline:'+file));},async match(request){const found=store.get(absolute(request));return found?.clone();},async put(request,response){store.set(absolute(request),response.clone());}};
 }};
 const self={registration:{scope},location:new URL(scope+'sw.js'),clients:{async claim(){}},async skipWaiting(){},addEventListener(name,callback){handlers[name]=callback;}};
 stores.set('another-app-cache',new Map());stores.set('dailyDashboard:'+scope+':old-version',new Map());
 vm.runInNewContext(source,{self,caches,URL,Response,Headers,fetch:async()=>{networkCalls++;if(!online)throw Error('offline');return new Response('fresh-data');}});
 async function lifecycle(name){let task;handlers[name]({waitUntil(promise){task=promise;}});await task;}
 await lifecycle('install');await lifecycle('activate');
 async function request(url,mode='cors'){
  let result;handlers.fetch({request:{url,method:'GET',mode},respondWith(value){result=value;}});return result?await result:null;
 }
 return{request,stores,setOnline(value){online=value;},count(){return networkCalls;}};
}
(async()=>{
 const scope='https://example.org/dashboard/',sw=await setup(scope);
 assert(sw.stores.has('another-app-cache'));assert(!sw.stores.has('dailyDashboard:'+scope+':old-version'));
 let response=await sw.request(scope+'index.html','navigate');assert.equal(response.headers.get('X-DailyDashboard-Cache'),'offline');assert((await response.text()).includes('index.html'));
 response=await sw.request(scope+'data/exchange-rates.json');assert.equal(response.headers.get('X-DailyDashboard-Cache'),'offline');
 sw.setOnline(true);response=await sw.request(scope+'data/exchange-rates.json');assert.equal(await response.text(),'fresh-data');
 sw.setOnline(false);response=await sw.request(scope+'data/exchange-rates.json');assert.equal(await response.text(),'fresh-data');assert.equal(response.headers.get('X-DailyDashboard-Cache'),'offline');
 const count=sw.count();assert.equal(await sw.request('https://api.exchangerate.host/live'),null);assert.equal(await sw.request(scope+'data/exchange-update-state.json'),null);assert.equal(sw.count(),count);
 const root=await setup('https://example.org/');assert.equal(await root.request('https://example.org/another-project/index.html','navigate'),null,'Root install must not replace another project navigation');
 console.log('PASS: offline shell and data fallback, cached-response marker, network refresh, scoped cache cleanup, no external API interception and no other-project navigation interception.');
})().catch(error=>{console.error(error);process.exitCode=1;});
