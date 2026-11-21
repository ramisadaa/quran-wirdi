const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..')+'/';
const parse=`from html.parser import HTMLParser
import json,sys
class P(HTMLParser):
 def __init__(self):super().__init__();self.root={'tag':'document','attrs':{},'text':'','children':[]};self.stack=[self.root]
 def handle_starttag(self,t,a):
  e={'tag':t,'attrs':dict((k,v or '')for k,v in a),'text':'','children':[]};self.stack[-1]['children'].append(e)
  if t not in ['meta','link','input','hr','br','img','source','wbr']:self.stack.append(e)
 def handle_startendtag(self,t,a):
  self.handle_starttag(t,a)
  if self.stack[-1]['tag']==t:self.stack.pop()
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i]['tag']==t:self.stack=self.stack[:i];break
 def handle_data(self,s):self.stack[-1]['text']+=s
p=P();p.feed(open(sys.argv[1]).read());print(json.dumps(p.root))`;
const dom=JSON.parse(cp.execFileSync('python3',['-c',parse,root+'index.html'],{encoding:'utf8'}));
function scripts(node){return (node.tag==='script'?[node.attrs.src]:[]).concat(...node.children.map(scripts));}
const bundle=scripts(dom).map(name=>[name,fs.readFileSync(root+name,'utf8')]);
function makeApp({saved={},failAll=false,primaryDown=true,badPlace=false,blocked=false,holdWeather=false,weatherDown=false,prayerBroken=false,invalidDuas=false}={}){
 let document;let now=Date.parse('2026-11-04T10:00:00Z');const tasks=[],intervals=[],requests=[],pendingWeather=[];const storage=new Map(Object.entries(saved));
 class Element{
  constructor(tag,attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.parent=null;this.events={};this._text='';this.className=attrs.class??'';this.value=attrs.value??'';this.checked='checked'in attrs;this.disabled='disabled'in attrs;this.hidden='hidden'in attrs;this.open=false;this.dataset={};this.style={setProperty(k,v){this[k]=v;}};
   for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
   this.classList={contains:n=>this.className.split(' ').includes(n),toggle:(n,force)=>{const yes=force??!this.classList.contains(n);this.className=this.className.split(' ').filter(x=>x&&x!==n).concat(yes?[n]:[]).join(' ');return yes;},remove:n=>this.classList.toggle(n,false)};
  }
  get parentElement(){return this.parent;}
  appendChild(e){e.parent=this;this.children.push(e);return e;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(v){this._text=String(v);this.children=[];}
  get href(){return this.attrs.href??'';}set href(v){this.attrs.href=v;}
  all(){return this.children.flatMap(x=>[x,...x.all()]);}
  simple(s){
   s=s.trim();if(s.includes('[')&&!s.startsWith('[')){const m=s.match(/^([a-z]+)(\[.*\])$/);if(m)return this.tag===m[1]&&this.simple(m[2]);}if(s.startsWith('#'))return this.attrs.id===s.slice(1);if(s.startsWith('.'))return this.classList.contains(s.slice(1));
   if(s.startsWith('[tabindex]'))return 'tabindex'in this.attrs&&this.attrs.tabindex!=='-1';
   const match=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(match)return match[1]in this.attrs&&(match[2]===undefined||this.attrs[match[1]]===match[2]);
   return this.tag===s;
  }
  matches(s){const parts=s.trim().split(/\s+/);if(parts.length===1)return this.simple(s);let node=this;if(!node.simple(parts.pop()))return false;while(parts.length){const token=parts.pop();node=node.parent;while(node&&!node.simple(token))node=node.parent;if(!node)return false;}return true;}
  querySelectorAll(s){return this.all().filter(e=>s.split(',').some(part=>e.matches(part)));}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  closest(s){let e=this;while(e&&!e.matches(s))e=e.parent;return e;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  removeAttribute(k){delete this.attrs[k];}
  getAttribute(k){return this.attrs[k]??null;}
  addEventListener(k,f){(this.events[k]??=[]).push(f);}
  removeEventListener(k,f){this.events[k]=(this.events[k]??[]).filter(x=>x!==f);}
  dispatch(k,event={}){const e={type:k,target:this,preventDefault(){this.defaultPrevented=true;},...event};this.dispatchEvent(e);if(k==='click'&&this.parent)this.parent.bubble(k,e);return e;}
  dispatchEvent(e){for(const f of this.events[e.type]??[])f(e);return true;}
  bubble(k,e){for(const f of this.events[k]??[])f(e);this.parent?.bubble(k,e);}
  click(){if(this.disabled)return;this.dispatch('click');if(this.tag==='summary'){this.parent.open=!this.parent.open;this.parent.dispatch('toggle');}}
  focus(){document.activeElement=this;}
  scrollIntoView(){this.scrolled=true;}
  contains(e){return e===this||this.all().includes(e);}
  getClientRects(){let e=this;while(e){if(e.hidden)return[];e=e.parent;}return[{width:44,height:44}];}
  getBoundingClientRect(){if(this.parent?.classList.contains('card-primary')){const i=this.parent.children.indexOf(this);return{left:i*55,right:(i+1)*55,width:55};}return{left:0,right:230,width:230};}
 }
 function build(node){const e=new Element(node.tag,node.attrs);e._text=node.text??'';for(const c of node.children)e.appendChild(build(c));if(node.tag==='select')e.value=e.children.find(x=>'selected'in x.attrs)?.attrs.value??e.children[0]?.attrs.value??'';return e;}
 document=build(dom);document.body=document.querySelector('body');document.documentElement=document.querySelector('html');document.hidden=false;document.readyState='complete';document.baseURI='http://localhost:8787/project/index.html';document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Element(tag);document.fonts={ready:Promise.resolve()};
 const window=new Element('window');
 const localStorage={getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v);},removeItem:k=>{if(blocked)throw Error('blocked');storage.delete(k);}};
 class ClockDate extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const response=(data)=>({ok:true,json:async()=>data});
 const fetch=async(input,options)=>{
  const url=String(input),u=new URL(url,document.baseURI);requests.push(url);
  if(u.pathname.endsWith('/data/duas.json')){const data=JSON.parse(fs.readFileSync(root+'data/duas.json','utf8'));if(invalidDuas)data[0].sourceUrl='javascript:bad';return response(data);}
  if(u.pathname.endsWith('/data/exchange-rates.json')){if(failAll)throw Error('offline');return response(JSON.parse(fs.readFileSync(root+'data/exchange-rates.json','utf8')));}
  if(failAll)throw Error('offline');
  if(u.hostname==='geocoding-api.open-meteo.com')return response({results:[{latitude:31.5,longitude:34.47,timezone:'Asia/Hebron',country_code:'PS',name:'غزة',country:'فلسطين',feature_code:'PPLA',population:600000}]});
  if(u.hostname.includes('currency-api.pages.dev')||u.hostname==='cdn.jsdelivr.net')return response({date:'2026-11-04',usd:{usd:1,ils:3.2,eur:.9,jod:.709}});
  if(u.hostname==='api.open-meteo.com'){
   if(holdWeather)return new Promise(resolve=>pendingWeather.push({resolve,u}));
   if(weatherDown)throw Error('weather down');
   return response({timezone:'Asia/Hebron',current:{time:1793783700,temperature_2m:26.8,relative_humidity_2m:49,wind_speed_10m:6,wind_direction_10m:270,weather_code:3,is_day:1}});
  }
  throw Error('Unexpected URL '+url);
 };
 const context=vm.createContext({window,document,localStorage,navigator:{geolocation:{getCurrentPosition(ok){ok({coords:{latitude:31.5,longitude:34.47}});}}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Date:ClockDate,Intl,URL,URLSearchParams,AbortController,fetch,requestAnimationFrame:fn=>tasks.push(fn),setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{intervals.push(fn);return intervals.length;},ResizeObserver:class{constructor(fn){}observe(){}}});
 for(const[name,code]of bundle){document.currentScript={src:new URL(name,document.baseURI).href};vm.runInContext(code,context,{filename:name});if(name.startsWith('assets/vendor'))window.adhan=prayerBroken?null:context.adhan;}
 async function flush(){for(let i=0;i<5;i++){await new Promise(setImmediate);const copy=tasks.splice(0);for(const task of copy)task();}}
 return{document,window,storage,requests,flush,pendingWeather,get:id=>document.getElementById(id),setNow:value=>{now=Date.parse(value);intervals.forEach(f=>f());},setFail:value=>{failAll=value;},app:window.Dashboard,clock:window.PrayerClock};
}
module.exports={makeApp};
