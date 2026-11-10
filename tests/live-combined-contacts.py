"""Live acceptance check for the combined contact version (real public services; run against a local build).

Usage: python3 tests/live-combined-contacts.py http://127.0.0.1:8090/
Covers: Carteret (Transways, Qualmax), Sayreville (Alzo), Florida (no carrier lookup), refresh keeps
contacts, Lock clears them, Retrieve info on a map popup, right-click Identify in both views, contact
question before any search, and a single Ask Radar box.
"""
import json, re, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090/"
results = []

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(detail)[:300]), flush=True)

CARD = """() => {const a=[...document.querySelectorAll('.chat-properties:not(.previous-search) article')].pop();if(!a)return null;
 const vis=e=>e&&e.getBoundingClientRect().height>0;
 return {address:a.querySelector('h3')?.innerText||'',owner:a.querySelector('.executive-identity')?.innerText||'',
  vault:a.querySelector('.executive-vault-contact')?.innerText||'',
  calls:[...a.querySelectorAll('a.executive-call')].filter(vis).map(x=>({text:x.innerText.trim(),review:x.classList.contains('needs-review')})),
  live:a.querySelector('.executive-live-contacts')?.innerText||null,
  liveButton:!!a.querySelector('.executive-live-contacts button'),
  mailing:[...a.querySelectorAll('.executive-contact-actions a')].some(x=>/mailing address/i.test(x.innerText)),
  metrics:vis(a.querySelector('.executive-metrics'))}}"""

def ask(page, text, wait=18000):
    box = page.locator("#agentPrompt"); box.fill(text); box.press("Enter"); page.wait_for_timeout(wait)

def enter(page):
    page.wait_for_selector('#accessPassword'); page.fill('#accessPassword', 'wp123'); page.click('#accessForm button')
    page.wait_for_selector('html:not([data-radar-locked])', timeout=30000); page.wait_for_timeout(3000)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 900}); page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="domcontentloaded"); enter(page)
    check("one Ask Radar box on screen", page.evaluate("[...document.querySelectorAll('#agentPrompt,.radar-agent input[type=search]')].filter(e=>e.getBoundingClientRect().height>0).length") == 1)

    # Contact question before any search
    ask(page, "find me a contact for one of the new nominations", 6000)
    picks = page.evaluate("[...document.querySelectorAll('.agent-quick-picks button')].map(b=>b.innerText)")
    check("contact question before a search lists real nominated-tract businesses", len(picks) >= 1 and all(" — " in x for x in picks), picks)

    # Carteret: Transways
    ask(page, "351 Roosevelt Ave, Carteret, NJ"); c = page.evaluate(CARD)
    texts = [x["text"] for x in c["calls"]]
    check("Transways: officers shown", "Dooley" in c["vault"], c["vault"][:200])
    check("Transways: federal-sourced phones are normal buttons", any("732-442-4630" in t and not x["review"] for x, t in zip(c["calls"], texts)), c["calls"])
    check("Transways: mailing address link kept", c["mailing"], c)
    check("Transways: live check button on NJ card, no A/B label", c["liveButton"] and not re.search(r"\b[AB] ·", c["live"] or ""), c["live"])
    page.locator(".chat-properties:not(.previous-search) article .executive-live-contacts button").last.click(); page.wait_for_timeout(25000)
    c2 = page.evaluate(CARD); live = c2["live"] or ""
    check("live check: Transways listed once", live.upper().count("TRANSWAYS MOTOR EXPRESS") == 1, live[:400])
    check("live check: phone formatted", "Call 732-442-4630" in live, live[:400])
    check("live check: filing age shown", re.search(r"filing (dated|date)|Old federal filing", live, re.I) is not None, live[:400])

    # Carteret: Qualmax
    ask(page, "60 Grant Ave, Carteret, NJ"); c = page.evaluate(CARD)
    check("Qualmax: sourced office line is a normal button", any("718-305-6766" in x["text"] and not x["review"] for x in c["calls"]), c["calls"])
    check("Qualmax: unsourced cell labelled needs review", any("917-676-1434" in x["text"] and x["review"] for x in c["calls"]), c["calls"])

    # Sayreville: Alzo
    ask(page, "650 Jernee Mill Rd, Sayreville, NJ"); c = page.evaluate(CARD)
    check("Alzo: office line shown", any("732-254-1901" in x["text"] for x in c["calls"]), c["calls"])
    check("Alzo: Tigran's 732-414-9004 not on the card", not any("732-414-9004" in x["text"] for x in c["calls"]) and "Tigran" not in c["vault"], c)

    # Florida
    ask(page, "6738 Wallis Rd, West Palm Beach, FL"); c = page.evaluate(CARD)
    check("Florida: owner shown", "EVERGLADES BOTANICAL" in c["owner"], c["owner"])
    check("Florida: no carrier lookup control", c["live"] is None, c["live"])
    check("Simple view shows land/building split", c["metrics"], c)

    # Right-click identify, Simple view
    page.evaluate("void PublicRadarBridge.getMap().setView([40.5797,-74.2276],17)"); page.wait_for_timeout(2500)
    box = page.locator('#map').bounding_box(); page.mouse.click(box['x']+box['width']/2, box['y']+box['height']/2, button='right'); page.wait_for_timeout(800)
    check("right-click menu opens (Simple view)", page.locator('.radar-map-menu-item', has_text='Identify property here').count() == 1)
    page.locator('.radar-map-menu-item', has_text='Identify property here').click(); page.wait_for_timeout(12000)
    check("identify ran without the toolbar button", page.evaluate("document.getElementById('identifyParcel')?.getAttribute('aria-pressed')") != 'true' and page.evaluate("!!document.querySelector('#details:not([hidden]) h2')"), page.evaluate("document.getElementById('details')?.innerText?.slice(0,160)"))

    # Retrieve info on a saved-property popup
    opened = page.evaluate("""() => {const m=PublicRadarBridge.getMap();let hit=null;m.eachLayer(l=>{if(!hit&&l.getPopup&&l.getPopup()&&/Retrieve info/.test(l.getPopup().getContent()?.innerText||''))hit=l;});if(!hit)return false;hit.openPopup();return true;}""")
    if opened:
        title = page.evaluate("document.querySelector('.leaflet-popup strong')?.innerText||''").strip().upper()
        page.locator('.leaflet-popup button', has_text='Retrieve info').first.click(); page.wait_for_timeout(18000)
        c = page.evaluate(CARD) or {}
        check("Retrieve info opens that property's card in the visible panel", title and title.split(',')[0] in (c.get('address') or '').upper() and page.evaluate("(()=>{const a=[...document.querySelectorAll('.chat-properties:not(.previous-search) article')].pop();return !!a&&a.getBoundingClientRect().height>0})()"), (title, c.get('address')))
    else:
        check("Retrieve info popup available on the map", False, "no saved-property markers with a Retrieve info button were loaded")

    # Refresh keeps contacts, Lock clears them
    page.reload(wait_until="domcontentloaded"); page.wait_for_timeout(4000)
    check("refresh keeps the workspace open", page.evaluate("!document.documentElement.hasAttribute('data-radar-locked')"))
    check("refresh keeps contacts unlocked", page.evaluate("RadarExecutiveVault.isVaultUnlocked()"))
    check("code is never stored in the browser", not page.evaluate("Object.values(sessionStorage).concat(Object.values(localStorage)).some(v=>/WP123/i.test(v))"))
    page.evaluate("RadarEntry.lock()"); page.wait_for_timeout(500)
    check("Lock clears session contacts", not page.evaluate("Object.keys(sessionStorage).some(k=>/vault/i.test(k))") and not page.evaluate("RadarExecutiveVault.isVaultUnlocked()"))

    # Right-click identify, All-tools view
    enter(page); page.click('#radarModeToggleBtn'); page.wait_for_timeout(1500)
    page.evaluate("void PublicRadarBridge.getMap().setView([40.5797,-74.2276],17)"); page.wait_for_timeout(2000)
    box = page.locator('#map').bounding_box(); page.mouse.click(box['x']+box['width']/2, box['y']+box['height']/2, button='right'); page.wait_for_timeout(800)
    check("right-click menu opens (All tools view)", page.locator('.radar-map-menu-item', has_text='Identify property here').count() == 1)
    check("no page errors", not errors, errors[:3])
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
