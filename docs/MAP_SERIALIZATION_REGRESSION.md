# Stress-runner map serialization regression

`set_view` accidentally returned Leaflet's `Map` object through `Page.evaluate`. Playwright can serialize small object graphs (including references); a sufficiently deep live map graph exceeds its serializer depth. The synthetic suite uses the actual Leaflet library, not a mock map, but starts with a much smaller graph than the live application. That difference let the old helper pass locally.

The helper now returns only `true`. Before the full stress run, the fixture suite attaches a 512-level object to the real map, demonstrates that the old expression raises `Cannot serialize result`, then calls the actual current helper on that same graph. It must move the map, return `True` and leave the requested zoom. Reverting the helper fails this check before the main 20 checks. The depth probe is removed before normal stress testing.

Live diagnostics retain manual dispatch. When GitHub's API cannot be reached, an explicit `[run-live-nj-oz]` marker on a push touching the diagnostic files triggers the same job. Public diagnostic results, tested SHA and workflow URL are written to `radar-diagnostics/nj-oz-live`, not the application branch. The branch contains only diagnostic JSON; no parcel owner or contact data. The write permission is scoped to this job and supports reporting through git when the API/artifact endpoint is unavailable.
