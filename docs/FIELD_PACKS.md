# Property cards, satellite views and field packs

Search results appear as property cards inside the conversation. Cards show the address/parcel ID, reported acreage, assessment type, construction year when published, distance and source retrieval time. Six cards load at a time; **Show more properties** reveals the next six. Partial results are labeled incomplete.

## Open a property

- Click the image or **Google satellite** to open the mapped location in Google Maps' satellite view.
- **Google Maps / images** searches the published address (falling back to mapped coordinates when no useful address exists); imagery/photos available there depend on Google's coverage.
- **Street View (if available)** opens the nearby panorama request. Coverage is not guaranteed.
- **View parcel on satellite** stays in Radar, switches to satellite basemap, fits the published polygon and highlights it. Point-only sources zoom to the published point and explicitly lack a parcel boundary.
- Official GIS layer links remain available in collapsed **Data source** / **Source and map accuracy** sections. They are technical citations rather than the primary property action.

The inline image comes from the Esri World Imagery service, with the source parcel outline overlaid. Google imagery is linked, not scraped or copied. Polygons preserve multipart shapes and interior holes. The reference point for a polygon is chosen on its published geometry rather than blindly using a bounding-box midpoint. Imagery capture date is not inferred from the retrieval date.

These views help identify the mapped site; they do not establish a surveyed boundary, title, verified ownership, legal access or current condition. A centroid is not an exact parcel footprint. Directions target the mapped reference point, not a verified driveway or entrance.

## Build a field trip

1. Select **Add to field trip** on a chat card, or **Add selected property to trip** in the field-trip panel.
2. Reorder stops with **Move up/down**. Add visit notes and a next action.
3. Attach up to three JPEG/PNG/WebP photos per stop, with 100 photos per trip. Images are resized to at most 1,600 pixels on their longest edge and stored as JPEG in IndexedDB; large photo bytes do not occupy localStorage.
4. Keep up to 100 trip stops. Select at most 25 for each generated field pack.
5. **Export trip backup** creates transferable JSON containing the selected public snapshots, visit order, notes, screening observations and photo bytes. **Merge trip backup** restores new stops; duplicate existing stops and notes are preserved.

Trip metadata stays in localStorage and photos in IndexedDB for the same browser/profile/origin. There is no automatic cross-device synchronization. Export a backup before switching browsers/devices, clearing browser data or relying on long-term retention. User-added notes/photos are not sent to the hosted assistant.

## Generate the report

Choose **Generate field pack**. Radar retrieves imagery for the selected stops and downloads a self-contained HTML file. Open that file and choose **Print / Save as PDF**. Each property starts a new printable section with its map, source facts, notes, next action, screening observations, stored photos and external map/direction links.

Available satellite images and photos are embedded in the HTML, so the report can display them without a connection. External map links still need connectivity. If an image cannot be retrieved, the page says **SATELLITE IMAGERY UNAVAILABLE — geometry reference only**. A grey map is never presented as an aerial image. User photo dates are labeled as dates added, not verified capture dates. Screening without recorded observations remains unchecked; missing data is not a clearance.

The new workflow uses the earlier pilot as a feature reference. It does not publish or automatically import its private portfolio, contacts, transactions or target records. Old pilot backup formats are not silently treated as this new version-1 field-trip format.

## Verification

Unit tests cover map links, geometry projection, holes/multipart shapes, point-only labels, report limits, provenance, excluded private attributes and HTML escaping. Browser tests cover a 49-result chat, paging, satellite focus, failure/retry messaging, stop order, photo persistence after reload, backup restoration, image failures and HTML/PDF generation. Small-screen tests use browser emulation, not a physical-phone field visit. One live imagery export was verified as HTTP 200/image/jpeg; source coverage and imagery age remain location dependent.

These property/field-pack features work on the static site without a hosted assistant. Hosted summaries require the separate authenticated backend. The static UI hides the unavailable summary action rather than presenting a broken control.
