# Useful PR #6 behavior in the hosted architecture

Reviewed the actual PR diff at `7275526`, not a wholesale feature merge. The PR's incremental changes are company-suffix regex repair, retaining explicitly retrieved company observations, adding company evidence to model prompts, and source-based regression checks. Its inherited browser-model architecture is obsolete here.

| Behavior | Current disposition |
| --- | --- |
| Recognize organization-style suffixes; exclude individual/family-trust classification | Already present in `radar-public-data.js`, with behavior tests. This is a name classification, not title or beneficial-owner verification. |
| Retain exact-ID public assessment observations with source and retrieval date | Already present in separate owner research, property cards and browser-local dossiers. Florida statewide identity includes county. Conflicting matches never select an owner. |
| Clearly distinguish assessment names from title/control/sale contacts | Already present on ownership/inventory cards and dossier research. Keep it outside hosted prompts. |
| Catch parsing failures instead of checking only source text | Added a parse-only check for every shipped first-party browser script. No browser/model code is executed by this check. |
| Guard hosted payloads | Added a regression proving PR #6's legacy entity-name/entity-source fields, contacts and mailing-address fields are excluded from actual hosted request bodies. |
| Carry richer non-owner provenance into grounded summaries | Worth a separate follow-up: per-parcel public source URL/vintage and geometry precision, plus published effective year only where supported and clearly distinguished from renovation. Aggregate source/date/status and basic public facts already exist. Any added field must be explicitly allowlisted and tested. |
| Local model loading, workers, WebGPU requirements, provider-branded executive controls or owner data in prompts | Do not port. Hosted API only; owner observations, contacts, dossiers and internal files remain outside model payloads. |

The local syntax-only PR repair still exists for review, but there is no reason to merge the old browser worker or owner-prompt fields to retain its useful functionality.

# Executive defaults and source retry

- Fresh sessions align the executive form with the existing NJ scanner default (Edison). Explicit choices in the executive area selector are remembered in localStorage with guarded reads/writes. Saved Florida areas restore Florida state, county and center; an explicit saved choice is not replaced by NJ. Invalid saved values safely fall back.
- This is a user preference, not a claim to detect residency. No automatic GPS prompt, IP geolocation or timezone-to-state inference is used.
- NJ nomination retrieval makes one automatic retry after a transient network/service failure or timeout. Permanent errors, malformed geometry, bad identities and truncation are not retried. Turning the layer off, moving the map or starting a new request cancels a pending retry. A second failure remains unavailable with existing valid boundaries retained where applicable.

Live diagnostic run [41670334710](https://github.com/prcasley/ubiquitous-fortnight/actions/runs/41670334710) tested commit `b713c796b892cd9ffd2e1a40cc14b132ef3c68e8` and returned 20/20 against the published site. It verifies the serialization fix and existing overlay behavior; it does not claim that subsequent retry/default changes were deployed during that earlier run.

Local validation of the follow-up UX/guard changes: 267 application tests, 19 Python checks, KML/OZ (27), executive entry (35), CEO (84), and stress (20 plus the serialization negative control) browser checks passed. The retry tests verify one-shot recovery, a two-attempt maximum on a persistent failure, no retry for a permanent HTTP error and cancellation on toggle-off. Preference tests cover fresh NJ defaults, restored Florida county/center/radius, explicit NJ persistence and invalid saved values. These changes were tested after the earlier live run; their new deployment/CI status is separate.
