# Plain-language chat (Nov 4, 2026)

Live testing with the phrasing brokers and executives actually use found that the chat often answered a
different question with confidence. `assets/radar-plain-language.js` now sits in front of the existing
parser. It rewrites what people type into a request Radar understands, shows how it read the request,
and answers honestly when Radar cannot do something.

| People type | Before | Now |
|---|---|---|
| A second question in the box | Spliced into the old text ("…5 ac**who owns**res…") | Box clears after every send |
| "10 acre", "5 acres or so" | Exactly 10.00 / exactly 5.00 acres | At least 10 / about 5 (±10%), with a note |
| "50k sf", "50,000 square feet" | Silently ignored | Says building size is not in parcel data |
| "08817" | "Which city?" | ZIP → Edison, NJ |
| "NJ Turnpike exit 8A", "GSP exit 129" | Generic reply | Centers on the exit |
| "in Monmouth" | Monmouth, **Oregon** | Monmouth County, NJ (geocoder also prefers covered states) |
| "Block 122 Lot 8.01 Edison", "PCN 00-42-…" | Ignored / generic | Exact parcel lookup; ambiguous or missing IDs are reported, never guessed |
| Coordinates, Google Maps links | Generic reply | Parcel at the point; road/between-parcel points list nearby parcels instead of picking one |
| Pasted broker email | Whole sentence used as the location | Address extracted; price/zoning/timeline claims flagged as unverifiable |
| "truck terminal", "IOS", "cold storage", "dirt" | Not understood | Industrial / vacant, with a note |
| "phone number", "how much is it worth", "near the highway", "start over", "QOZ?", "tax break zones", "explain in plain English" | "N of N records match this question" + unrelated list | Honest answers: no contact data; labeled tax-record values; filter not available; reset; official OZ check; plain-English explanation |
| Any other question with no filter | Same catch-all list | "I did not recognize a supported property filter…" with examples |
| Statewide ("in New Jersey"), other states ("Edison NY") | Generic reply / silent state switch | Explained |

Tests: `tests/plain-language.test.mjs` (phrasing and resolver contracts), `tests/plain-language-browser.py`
(fixture conversation, including real keyboard typing), and `scripts/live-persona-check.py` (18 live
conversations against the published site; manual or weekly via `live-persona-check.yml`).
