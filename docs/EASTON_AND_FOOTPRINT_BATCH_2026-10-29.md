# Restored reference publication and Easton/footprint corrections

The user authorized publishing the recovered parcel facts and reference layers while retaining held analysis locally. The standard Pages build now includes 1,608 historical parcel observations, 24 municipality layers and 194 dated OZ eligibility references. It fetches the reviewed dataset on deployed hosts, not just localhost. Target rankings, strategy, draft risk conclusions, lease/listing references, demo transactions and the Hilton concept plan remain outside the published payload. Legacy facts do not become fresh verified scans or acquisition approvals.

## Northampton identity

Northampton may omit `OBJECTID` even when requested. Ordered object-ID snapshots are still used to request bounded 50-ID batches, but returned features are validated/deduplicated using the source's published `PARCEL_ID`. PA requests order by that parcel field, and `outFields` are deduplicated. Count reconciliation, missing/repeated parcel detection, source caps and explicit partial status remain. The shared browser fixture now omits Northampton OBJECTID in every feature response; the Easton regression checks PA/NJ merge under this exact condition. This supersedes earlier assumptions that returned OIDs could be required from this MapServer.

## Building request batch

Microsoft building-download endpoints are blocked by this execution environment, so no new Microsoft geometry is claimed or packaged. The implemented fallback is one combined OSM query for the shortlist: a union of each candidate's small bounding box rather than a city-wide rectangle. This avoids downloading unrelated city geometry and removes the per-parcel request storm.

- Only one building request runs at a time.
- Primary: `overpass-api.de`; backup: `overpass.kumi.systems`. Backup is tried sequentially after failure, never in parallel.
- Each server gets a 12-second client budget and a 10-second Overpass query budget.
- Successful geometry responses are cached for ten minutes, then clipped/unioned independently for each parcel.
- Batch bounds: 25 parcels maximum, 2,000 returned building elements maximum, 200 measured footprints per parcel, bounded query memory and per-parcel envelope size. Partial/error/tainted responses are not used to claim coverage.
- Empty mapping remains unknown, not zero buildings, vacancy or usable outdoor storage.
- Owner/environment/road checks continue independently. Every parcel shares the same footprint promise, so a failed building batch cannot create nine consecutive timeout/retry cycles.

This is the requested bounded fallback, not proof that public Overpass will answer in every executive demo. Live upstream availability and Northampton's live response still need checking after Pages publication; these hosts cannot be independently reached here. Synthetic regressions cover omitted OIDs, both states merging, a single shared building query, sequential failover, timed-out batches and parcel-specific clipping. Physical suitability remains an evidence-based screening proxy; zoning, sale availability and utility capacity are not inferred.
