"""Nine browser screenshots plus layout, contrast, keyboard, CSP and offline checks.
Requires: pip install -r requirements-tests.txt; python -m playwright install chromium.
"""
from pathlib import Path
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json
import os
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
out=root/'test-results';out.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/index.html'
place={'latitude':31.5,'longitude':34.47,'timezone':'Asia/Hebron','method':3,'label':'غزة، فلسطين','city':'غزة','country':'Palestine'}
weather={'timezone':'Asia/Hebron','current':{'time':1793783700,'temperature_2m':26.8,'relative_humidity_2m':49,'wind_speed_10m':6,'wind_direction_10m':270,'weather_code':3,'is_day':1}}

def luminance(rgb):
    values=[value/255 for value in rgb]
    values=[value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4 for value in values]
    return sum(a*b for a,b in zip(values,[.2126,.7152,.0722]))
def contrast(a,b):
    values=sorted([luminance(a),luminance(b)])
    return(values[1]+.05)/(values[0]+.05)

def verify(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('.prayer-summary').get_attribute('aria-label')is None
    assert page.locator('#nextPrayerName').inner_text()in page.locator('.prayer-summary').aria_snapshot()
    assert page.locator('#windDirection').inner_text()=='غربي'
    assert page.locator('#calendarNote').evaluate('(e)=>getComputedStyle(e).position')!='absolute'
    boxes=[page.locator('#'+name).bounding_box()for name in ['dateCard','prayerCard','currencyCard','weatherCard','duaCard']]
    assert all(boxes[i+1]['y']>=boxes[i]['y']+boxes[i]['height']for i in range(4)), 'Cards must stay in one vertical column'
    values=page.locator('.calendar-note,.widget-note,.widget-status,.dua-source,.dua-counter,.dua-toggle-hint,.prayer-expand-hint,.weather-condition,.weather-metric,.widget-action,.dua-button').evaluate_all('(items)=>items.filter(e=>e.getClientRects().length).map(e=>({id:e.id,cls:e.className,font:parseFloat(getComputedStyle(e).fontSize)}))')
    assert all(value['font']>=13 for value in values),values
    for selector,bg in [('.today-label',(198,163,77)),('.calendar-note',(237,241,239)),('.widget-note',(237,241,239)),('.footer-link',(255,255,255)),('.intro p',(18,56,47))]:
        for color in page.locator(selector).evaluate_all('(items)=>items.filter(e=>e.getClientRects().length).map(e=>getComputedStyle(e).color.match(/[\\d.]+/g).slice(0,3).map(Number))'):
            assert contrast(color,bg)>=4.5,(selector,color,contrast(color,bg))

try:
    with sync_playwright()as p:
        options={'headless':True}
        if os.environ.get('BROWSER_EXECUTABLE'):options['executable_path']=os.environ['BROWSER_EXECUTABLE']
        browser=p.chromium.launch(**options)
        for theme in ['green','blue','burgundy']:
            for width in [320,390,1440]:
                context=browser.new_context(viewport={'width':width,'height':900},locale='ar-PS',timezone_id='Asia/Hebron',reduced_motion='reduce')
                context.add_init_script('localStorage.setItem("dailyDashboard.location.v1",'+json.dumps(json.dumps(place,ensure_ascii=False))+');localStorage.setItem("dailyDashboard.themeColor.v1",'+json.dumps(json.dumps(theme))+');Math.random=()=>0;')
                context.route('https://api.open-meteo.com/**',lambda route:route.fulfill(json=weather))
                requests=[];context.on('request',lambda request:requests.append(request.url))
                page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.clock.install(time=datetime(2026,11,4,10,0,tzinfo=timezone.utc));page.goto(url)
                page.evaluate('document.fonts.ready');page.wait_for_function('document.querySelector("#temperature").textContent!=="—"')
                verify(page)
                page.screenshot(path=str(out/f'{theme}-{width}.png'),full_page=True)
                page.locator('.show').click();assert page.locator('#closeSettings').evaluate('(e)=>e===document.activeElement')
                assert page.locator('#scene').evaluate('(e)=>e.inert')
                page.locator('.theme-font button').nth(1).click();page.evaluate('document.fonts.ready')
                page.keyboard.press('Escape');assert page.locator('.show').evaluate('(e)=>e===document.activeElement')
                page.locator('.show').click();page.locator('#currencyBase').select_option('USD');page.locator('#closeSettings').click()
                assert page.locator('#rateUSD').evaluate('(e)=>e.closest(".rate-row").hidden')
                assert not any('api.aladhan.com'in request or 'api.exchangerate.host'in request for request in requests)
                assert not errors,errors
                if theme=='green'and width==390:
                    page.wait_for_function('navigator.serviceWorker.controller!==null')
                    context.set_offline(True);page.reload(wait_until='domcontentloaded')
                    page.wait_for_function('document.querySelector("#nextPrayerTime").textContent!=="--:--"')
                    assert page.locator('#duaText').inner_text()!='الأدعية غير محمّلة'
                    assert page.locator('#currencyStatus').inner_text().find('محفوظة')>=0
                    assert page.locator('#weatherStatus').inner_text().find('محفوظة')>=0
                    assert not errors,errors
                context.close()
        browser.close()
    print('PASS: nine screenshots, vertical layouts, minimum type sizes, contrast, summary content, keyboard focus, CSP startup, no account/prayer API and offline reload.')
finally:
    server.shutdown();server.server_close()
