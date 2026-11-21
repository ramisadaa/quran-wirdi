"""تحديث مركزي وحيد للأسعار. لا يستدعيه المتصفح. يتطلب Secret في GitHub Actions.
الحجز يُحفظ في المستودع قبل الطلب لضمان عدم تكرار استهلاك الحصة عند إعادة التشغيل.
"""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import re
import uuid
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / 'data/exchange-update-state.json'
DATA = ROOT / 'data/exchange-rates.json'
CONFIG = ROOT / 'data/exchange-schedule.json'


def read_json(path, fallback=None):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def utc_text(now):
    return now.astimezone(timezone.utc).isoformat(timespec='seconds')


def output(name, value):
    # Only non-sensitive control values are exposed to the workflow.
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as handle:
            handle.write(f'{name}={value}\n')


def configuration():
    config = read_json(CONFIG)
    tz = ZoneInfo(config['timezone'])
    times = config['times']
    if not isinstance(times, list) or len(times) != 3 or len(set(times)) != 3 or not all(
        isinstance(value, str) and re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value) for value in times
    ):
        raise ValueError('The schedule must contain exactly three unique HH:MM times.')
    return config, tz, sorted(times)


def reservation_target(now, tz, times):
    event = os.environ.get('GITHUB_EVENT_NAME', '')
    created = os.environ.get('WORKFLOW_CREATED_AT')
    if event in ('schedule', 'workflow_dispatch') and not created:
        raise ValueError('Missing original workflow creation time.')
    anchor = datetime.fromisoformat(created.replace('Z', '+00:00')) if created else now
    local = anchor.astimezone(tz)
    day = local.date()
    if event == 'schedule':
        match = re.fullmatch(r'(\d{1,2}) (\d{1,2}) \* \* \*', os.environ.get('SCHEDULE_CRON', ''))
        if not match:
            raise ValueError('A separate explicit cron is required for each slot.')
        slot = f'{int(match[2]):02d}:{int(match[1]):02d}'
        if slot not in times:
            raise ValueError('Schedule and configured slots differ.')
        hour, minute = map(int, slot.split(':'))
        target = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
        if target > local:
            day -= timedelta(days=1)
    else:
        due = [value for value in times if value <= local.strftime('%H:%M')]
        slot = due[-1] if due else times[0]
    hour, minute = map(int, slot.split(':'))
    target = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
    # A very old queued job or rerun cannot consume a slot for a different day.
    if (now - target).total_seconds() > 18 * 3600:
        print('Expired scheduled occurrence. No request was made.')
        return None
    return day.isoformat(), slot, utc_text(target)


def reserve(now=None):
    output('should_fetch', 'false')
    if not os.environ.get('EXCHANGERATE_API_KEY', '').strip():
        print('::warning::Set the EXCHANGERATE_API_KEY repository secret. No provider request was made.')
        return False
    now = now or datetime.now(timezone.utc)
    config, tz, times = configuration()
    local = now.astimezone(tz)
    today, month = local.date().isoformat(), local.strftime('%Y-%m')
    target = reservation_target(now, tz, times)
    if target is None:
        return False
    scheduled_day, slot, scheduled_for = target
    slot_key = f'{scheduled_day}:{slot}'
    state = read_json(STATE, {'version': 1, 'month': '', 'monthAttempts': 0, 'days': {}})
    if state.get('version') != 1 or not isinstance(state.get('days'), dict):
        raise ValueError('Invalid request ledger. Restore the ledger instead of resetting it.')
    if state.get('month') != month:
        baseline = int(config.get('usageAlreadyConsumed', 0)) if config.get('usageMonth') == month else 0
        state['month'], state['monthAttempts'] = month, max(0, baseline)
    record = state['days'].get(today, {'attempts': 0, 'slots': []})
    daily_limit = min(3, int(config.get('maxDailyRequests', 3)))
    monthly_limit = min(100, int(config.get('maxMonthlyRequests', 100)))
    if state.get('blockedMonth') == month:
        print('Provider quota is exhausted for this month. No request was made.'); return False
    reserved_slots = state.setdefault('reservedSlots', {})
    if slot_key in reserved_slots or (scheduled_day == today and slot in record['slots']):
        print(f'Slot {today} {slot} was already reserved. No duplicate request.'); return False
    if record['attempts'] >= daily_limit or state['monthAttempts'] >= monthly_limit:
        print('Daily or monthly request limit reached. No request was made.'); return False
    record['attempts'] += 1
    record['slots'].append(slot_key)
    reserved_slots[slot_key] = utc_text(now)
    state['days'][today] = record
    state['monthAttempts'] += 1
    reservation_id = uuid.uuid4().hex
    state['lastReservation'] = {'id': reservation_id, 'date': today, 'scheduledDate': scheduled_day, 'scheduledFor': scheduled_for, 'slot': slot,
                                'reservedAt': utc_text(now), 'status': 'reserved'}
    cutoff = (local.date() - timedelta(days=40)).isoformat()
    state['days'] = {day: value for day, value in state['days'].items() if day >= cutoff}
    state['reservedSlots'] = {key: value for key, value in reserved_slots.items() if key[:10] >= cutoff}
    write_json(STATE, state)
    output('should_fetch', 'true'); output('reservation_id', reservation_id)
    print(f'Reserved one request for {today} {slot}. Month counter: {state["monthAttempts"]}/{monthly_limit}.')
    return True


class ProviderFailure(Exception):
    def __init__(self, code):
        self.code = str(code)
        super().__init__('Exchange provider request failed.')


def request_provider(key):
    # No retries. One reserved slot can make at most one provider HTTP request.
    request = Request('https://api.exchangerate.host/live?' + urlencode({'access_key': key}),
                      headers={'Accept': 'application/json', 'User-Agent': 'DailyDashboard/1.0'})
    try:
        with urlopen(request, timeout=25) as response:
            payload = json.loads(response.read(1_000_000))
    except HTTPError as error:
        # Do not print exception URLs, bodies or headers; they can contain the key.
        try:
            payload = json.loads(error.read(20_000))
        except Exception:
            raise ProviderFailure('http_' + str(error.code)) from None
    if payload.get('success') is False or payload.get('error'):
        code = payload.get('error', {}).get('code', 'provider_error')
        raise ProviderFailure(code)
    return payload


def normalize(payload, now, slot):
    source = str(payload.get('source', payload.get('base', 'USD'))).upper()
    if not re.fullmatch(r'[A-Z]{3}', source):
        raise ProviderFailure('invalid_source')
    if isinstance(payload.get('quotes'), dict):
        values = {source: 1.0}
        for currency in ['USD', 'EUR', 'ILS', 'JOD']:
            if currency != source:
                values[currency] = payload['quotes'].get(source + currency)
    elif isinstance(payload.get('rates'), dict):
        values = {**payload['rates'], source: 1.0}
    else:
        raise ProviderFailure('invalid_response')
    for currency in ['USD', 'EUR', 'ILS', 'JOD']:
        value = values.get(currency)
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value <= 0:
            raise ProviderFailure('missing_currency')
    quotes = {currency: values[currency] / values['USD'] for currency in ['USD', 'EUR', 'ILS', 'JOD']}
    if not (.1 <= quotes['ILS'] <= 1000 and .05 <= quotes['EUR'] <= 20 and .05 <= quotes['JOD'] <= 20):
        raise ProviderFailure('unsafe_rates')
    date = payload.get('date')
    if not isinstance(date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        stamp = payload.get('timestamp')
        if not isinstance(stamp, (float, int)) or not math.isfinite(stamp):
            raise ProviderFailure('missing_timestamp')
        date = datetime.fromtimestamp(stamp, timezone.utc).date().isoformat()
    return {'date': date, 'fetchedAt': utc_text(now), 'slot': slot, 'provider': 'exchangerate.host',
            'providerUrl': 'https://exchangerate.host/', 'base': 'USD', 'quotes': quotes}


def fetch_reserved(now=None, transport=request_provider):
    now = now or datetime.now(timezone.utc)
    state = read_json(STATE)
    reservation = state.get('lastReservation') if isinstance(state, dict) else None
    expected = os.environ.get('EXCHANGE_RESERVATION_ID')
    if not reservation or reservation.get('status') != 'reserved' or (expected and expected != reservation.get('id')):
        print('No fresh matching reservation. No request was made.'); return True
    key = os.environ.get('EXCHANGERATE_API_KEY', '').strip()
    if not key:
        print('::error::EXCHANGERATE_API_KEY is missing. No provider request was made.'); return False
    # Persist attempted status locally before I/O. The remote reservation was already committed by the workflow.
    reservation['status'] = 'attempting'; reservation['attemptedAt'] = utc_text(now)
    write_json(STATE, state)
    try:
        snapshot = normalize(transport(key), now, reservation['slot'])
        data = read_json(DATA, {'version': 1, 'snapshots': []})
        previous = data.get('latest', {}).get('quotes', {})
        if all(isinstance(previous.get(code), (int, float)) and previous[code] > 0 for code in snapshot['quotes']):
            for first in snapshot['quotes']:
                for second in snapshot['quotes']:
                    old_rate = previous[second] / previous[first]
                    new_rate = snapshot['quotes'][second] / snapshot['quotes'][first]
                    if abs(new_rate / old_rate - 1) > .20:
                        raise ProviderFailure('unsafe_deviation')
        history = data.get('snapshots', [])
        history = [item for item in history if (item.get('fetchedAt'), item.get('slot')) != (snapshot['fetchedAt'], snapshot['slot'])]
        history.append(snapshot)
        config, _, _ = configuration()
        limit = min(31, max(1, int(config.get('historyDays', 7)))) * 3
        data = {'version': 1, 'latest': snapshot, 'snapshots': history[-limit:]}
        write_json(DATA, data)
        reservation['status'] = 'success'
        print('Shared exchange data updated. Visitors read only the saved site JSON.')
        ok = True
    except ProviderFailure as error:
        reservation['status'] = 'failed'
        reservation['errorCode'] = error.code if re.fullmatch(r'[A-Za-z0-9_]{1,50}', error.code) else 'provider_error'
        if error.code == '104': state['blockedMonth'] = state['month']
        print('::error::Exchange provider rejected the request. Previous rates were preserved. Code: ' + reservation['errorCode'])
        ok = False
    except Exception:
        reservation['status'] = 'failed'; reservation['errorCode'] = 'network_or_response_error'
        print('::error::Unable to update rates. Previous data was preserved; no automatic retry will consume another request.')
        ok = False
    reservation['finishedAt'] = utc_text(now)
    write_json(STATE, state)
    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['reserve', 'fetch'])
    args = parser.parse_args()
    try:
        if args.action == 'reserve':
            reserve(); return 0
        return 0 if fetch_reserved() else 1
    except Exception:
        # A key-bearing URL must never reach a traceback or public Actions log.
        print('::error::Invalid exchange job configuration or ledger. No unlogged retry was attempted.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
