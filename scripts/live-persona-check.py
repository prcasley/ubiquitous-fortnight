"""Live persona check: types into the published Radar the way brokers and executives actually do.

Usage:  python3 scripts/live-persona-check.py [--url URL] [--only NAME]
Each case is a short conversation. A case fails when the reply contains a known-bad answer
(e.g. the old "N of N records match this question" catch-all) or misses what it must say.
Live public GIS is slow and occasionally unavailable; a source outage is reported as
UNAVAILABLE, not as a pass. Results go to test-results/live-persona.json.
"""
import argparse, json, os, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CATCH_ALL = 'records in the retrieved source results match this question'
OUTAGE = re.compile(r'timed out|Failed to fetch|could not complete this search|lookup unavailable', re.I)

# (name, [(message, must_contain_any, must_not_contain)], minimum results after the last message or None)
CASES = [
    ('approximate acreage + building size', [("Hi there, I'm looking for a warehouse around 50,000 square feet near Edison, maybe 5 acres or so. Thanks!", ['about 5 acres', '4.5–5.5'], ['exactly 5', 'with exactly'])], 1),
    ('"10 acre" means at least 10', [('show me industrial land edison new jersey 10 acre', ['at least 10 acres'], ['with exactly 10'])], 1),
    ('building SF is acknowledged', [('50k sf building Secaucus', ['do not include building size'], [])], 1),
    ('ZIP code', [('industrial in 08817', ['ZIP 08817 is Edison, NJ'], ['Which city or address'])], 1),
    ('highway exit', [('truck terminal near NJ Turnpike exit 8A', ['Turnpike Exit 8A'], ['Tell me a town'])], 1),
    ('county without "County"', [('any dirt over 20 acres in Monmouth', ['Monmouth County, NJ'], ['located in OR'])], 1),
    ('NJ block and lot', [('Block 122 Lot 8.01 Edison NJ', ['2005 Lincoln Hwy'], [])], None),
    ('nonexistent block and lot', [('Block 12 Lot 3 Edison NJ', ['has no Block 12 Lot 3'], [])], None),
    ('Palm Beach PCN', [('PCN 00-42-43-27-05-006-4201', ['7777 Southern Blvd'], ['Tell me a town'])], None),
    ('coordinates on a parcel', [('26.68012, -80.17173', ['7777 Southern Blvd'], ['Tell me a town'])], None),
    ('coordinates on a road', [('26.6797, -80.1733', ['did not pick one'], ['Tell me a town'])], None),
    ('Google Maps link', [('https://www.google.com/maps/place/7777+Southern+Blvd,+West+Palm+Beach,+FL+33411', ['7777 Southern Blvd'], ['Tell me a town'])], None),
    ('pasted broker email', [('I hope all is well, I know this property owner VERY well, I have transacted with him in the past. He has 6.05 AC at 7777 Southern Blvd West Palm Beach, he would sell for ~$14M. Zoning has been changed from Agriculture to Industrial. What do you think?', ['pulled the property address', 'cannot be confirmed from public records'], ['Tell me a town'])], None),
    ('statewide request', [('cold storage over 100000 sf in New Jersey', ['Statewide searches are not available'], ['Tell me a town'])], None),
    ('other state named', [('Edison NY industrial', ['not connected'], [])], None),
    ('follow-ups after a search', [
        ('Industrial over 5 acres in Edison NJ', ['Searching'], []),
        ('what about bigger ones', ['largest'], [CATCH_ALL]),
        ('show me the biggest one', ['Largest accepted parcel', 'acres'], [CATCH_ALL]),
        ('who owns it', ['parcel 1205_395_37', 'OLYMPIC'], []),
        ('whats the owners phone number', ["doesn't have owner phone numbers or emails"], [CATCH_ALL]),
        ('how much is it worth', ['not market value'], [CATCH_ALL]),
        ('only the ones near the highway', ["isn't a search filter yet"], [CATCH_ALL]),
        ('is the neighborhood nice', ['did not recognize a supported property filter'], [CATCH_ALL]),
        ('start over', ['Cleared'], [CATCH_ALL])], None),
    ('OZ phrasings after a search', [
        ('Industrial over 5 acres in Camden NJ', ['Searching'], []),
        ('QOZ?', ['nominat', 'opportunity'], [CATCH_ALL]),
        ('is this in one of those new tax break zones', ['nominat', 'opportunity'], [CATCH_ALL]),
        ('which ones get the tax benefit', ['nominat', 'opportunity'], [CATCH_ALL]),
        ('explain that in plain english', ['eligib', 'nominat', 'designat', 'OZ'], [CATCH_ALL])], None),
    ('typed follow-up is not spliced', [('Industrial over 5 acres in Newark NJ', ['Searching'], []), ('TYPED:who owns the largest one', ['Checking published assessment names', 'Published assessment', 'No owner name'], ['acwho'])], None),
]


def run(url, only=None):
    results = []
    with sync_playwright() as pw:
        exe = None if os.environ.get('RADAR_USE_MANAGED_CHROMIUM') == '1' else os.environ.get('RADAR_CHROMIUM_PATH')
        browser = pw.chromium.launch(**({'executable_path': exe} if exe else {}))
        for name, turns, minimum in CASES:
            if only and only.lower() not in name.lower():
                continue
            ctx = browser.new_context(viewport={'width': 1440, 'height': 950})
            ctx.add_init_script("sessionStorage.setItem('capital-radar-entry-v1','entered')")
            page = ctx.new_page(); errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(url, wait_until='networkidle', timeout=90000); page.wait_for_timeout(1500)
            status, detail = 'PASS', []
            for message, must_any, must_not in turns:
                idle(page)
                page.evaluate("()=>{document.querySelectorAll('#agentLog [data-mark]').forEach(e=>e.removeAttribute('data-mark'));document.getElementById('agentLog').lastElementChild?.setAttribute('data-mark','1');return true}")
                if message.startswith('TYPED:'):
                    page.click('#agentPrompt'); page.keyboard.type(message[6:], delay=10); page.keyboard.press('Enter')
                else:
                    page.fill('#agentPrompt', message); page.press('#agentPrompt', 'Enter')
                page.wait_for_timeout(1200); idle(page); page.wait_for_timeout(1500)
                reply = page.evaluate("()=>{const out=[];let e=document.querySelector('#agentLog [data-mark]');e=e?e.nextElementSibling:document.getElementById('agentLog').firstElementChild;while(e){out.push(e.innerText);e=e.nextElementSibling}return out.join('\\n')}")
                bad = [x for x in must_not if x.lower() in reply.lower()]
                good = not must_any or any(x.lower() in reply.lower() for x in must_any)
                if OUTAGE.search(reply) and not good:
                    status = 'UNAVAILABLE'; detail.append(f'{message[:60]!r}: public source unavailable')
                elif bad or not good:
                    status = 'FAIL'; detail.append(f'{message[:60]!r}: ' + (f'contained {bad}' if bad else f'missing any of {must_any}') + ' | reply: ' + reply.replace('\n', ' ')[:300])
            count = page.evaluate('()=>PublicRadarBridge.getResults().length')
            if status == 'PASS' and minimum is not None and count < minimum:
                status = 'FAIL'; detail.append(f'expected at least {minimum} results, got {count}')
            if errors:
                status = 'FAIL'; detail.append('page errors: ' + '; '.join(errors[:2]))
            results.append({'case': name, 'status': status, 'results': count, 'detail': detail})
            print(f"{status:11} {name}" + (' — ' + ' || '.join(detail) if detail else ''), flush=True)
            ctx.close()
        browser.close()
    return results


def idle(page, timeout=150):
    end = time.time() + timeout
    while time.time() < end and page.evaluate("()=>document.querySelector('#agentForm button[type=submit]').disabled"):
        page.wait_for_timeout(400)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='https://prcasley.github.io/ubiquitous-fortnight/')
    parser.add_argument('--only')
    args = parser.parse_args()
    results = run(args.url, args.only)
    out = ROOT / 'test-results'; out.mkdir(exist_ok=True)
    (out / 'live-persona.json').write_text(json.dumps(results, indent=1))
    failed = [r for r in results if r['status'] == 'FAIL']
    print(f"\n{sum(r['status']=='PASS' for r in results)}/{len(results)} passed, {len(failed)} failed, {sum(r['status']=='UNAVAILABLE' for r in results)} source-unavailable")
    sys.exit(1 if failed else 0)
