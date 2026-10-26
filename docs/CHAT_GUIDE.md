# Plain-language property requests

Type the request naturally. Radar repeats the filters it understood, asks for a missing city/address once, and keeps the original filters when you answer. “Near me” uses browser location permission. Selecting a market, county or map center supplies location context too.

| Example | Interpretation |
|---|---|
| Find me the nearest parcels with 5 acres and for industrial | Industrial, at least 5 acres, nearest first; asks where if no location has been chosen |
| Edison NJ | Completes the pending request; does not discard the acreage/type |
| Find a 6-acre parcel near Edison NJ | Exactly 6 reported acres; suggests “about 6 acres” if no accepted records match |
| Find warehouses about 6 acres near Edison NJ | Industrial, 5.4–6.6 acres; explicitly labels the ±10% range |
| Find industrial parcels between 5 and 10 acres near Edison NJ | Inclusive acreage range |
| Actually exactly 7 acres | Updates the last completed search, preserving its property type and location |
| Find a six-acre parcel up for renewal with the owner name | Searches acreage candidates; renewal dates and verified owner names remain unverified |
| Find a NJ property for sale around $200 per sq foot | Requests a city if needed; explains that active listings/asking prices are unavailable and returns public-record candidates only |

“With 5 acres” is interpreted as a minimum and confirmed as “at least 5.” “A 6-acre parcel” means exactly the reported acreage. “About/roughly/approximately” uses a visible ±10% band. Source-reported acreage is not a surveyed net usable area.

## Asking prices and comparable sales

For an industrial building, a more precise request is:

> Find industrial properties currently listed for sale near Edison, NJ, with asking sale prices around $200 per building square foot.

For comparable transactions:

> Compare recent closed industrial sales near Edison, NJ, using closed-sale price per building square foot, with sale dates and building sizes shown.

These are different measures. Asking sale price uses the current listing's total asking price and relevant building area. Closed-sale price uses the recorded transaction price and relevant building area at the time of sale. Land price per square foot/acre and annual or monthly asking rent are separate measures. A useful comparison also needs property type, size, condition, location and transaction date; matching $/SF alone does not establish comparability.

Active listings, asking prices, closed-sale comparables and verified lease schedules are **not connected** to the current public parcel scanner. Such requests are retained as research objectives, clearly marked unverified in the chat, results, saved snapshots and hosted summaries. The app does not quietly mark candidates for sale, up for renewal or within a price target. Supplied private histories remain separate from this public search.

For renewal screening, specify a dated window such as “leases expiring in the next 12 months” once a lease schedule is connected. Recorded assessment owners are distinct from verified title or ultimate ownership. Florida has an individual source lookup; the connected NJ statewide layer redacts names.

Natural-language handling remains available without hosted AI. Hosted summaries can explain the resulting facts, but cannot replace missing datasets. Unit tests check interpretation and generated predicates; browser tests run the example conversations against deterministic source fixtures. This does not establish live listing, lease or comps coverage.
