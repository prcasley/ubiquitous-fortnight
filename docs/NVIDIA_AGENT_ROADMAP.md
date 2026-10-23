# Open-Weight AI Agent Integration

The public interface works **today in deterministic, source-grounded mode**, without a cloud model or user API key. This is intentional: static Pages hosting cannot safely hold inference credentials or execute a private GPU service.

## NVIDIA open-weight components and intended roles

| Model | Role | Deployment |
|---|---|---|
| [NVIDIA Nemotron 3 Nano 4B](https://build.nvidia.com/models) | Explain a verified public source result, ask for missing filters, guide users to parcels and geographic overlays | Optional `server/nemotron-gateway.mjs`; no live inference in public Pages |
| [Nemotron Parse 2.0](https://catalog.ngc.nvidia.com/orgs/nim/nvidia/models/nemotron-parse-v2.0) | Extract proposed zoning/permit/record fields from explicitly public government PDF scans and retain page/section references | Future isolated document-processing worker, not browser-only and not deployed |
| [Nemotron 3 Embed 1B](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b) | Semantic retrieval of government source records and candidate **entity** similarity; embeddings are leads, not verified ownership | Future vector index of approved public-source text, not deployed |
| Browser speech recognition | Hands-free question dictation with opt-in disclosure | Available only on supported devices/browsers; may transmit voice to browser provider |

NVIDIA model licenses and deployment rights vary by model; verify the exact model card and license before production.

Other discussed options (aerial-image hypotheses and relational prediction) require separate benchmark/privacy review and are NOT proof of parcel condition or priority. Third-party models should not be described as NVIDIA open-weight models without verification.

## Trust architecture

```text
User query (e.g., "industrial above 5 acres near Edison")
  -> deterministic parser / state + county + radius
  -> explicit GIS query to verified, allowlisted public source
  -> response-count / geometry-completeness checks
  -> normalized record, record ID, source URL and retrieval timestamp
  -> deterministic answer now
  -> optional authenticated NVIDIA explanation later (interpretation only)
```

AI must **never** invent or fill missing parcel IDs, owners, zoning, remodel year, lease details, opportunity-zone designations, values, or availability. It may summarize source records with caveats and allow the user to click the authoritative layer.

The public browser sends no personal owner names and no private documents to a model. The future NIM gateway implements a strict field allowlist of ID, address, state, assessment class, acreage and year built. It must stay loopback-bound behind company-managed SSO/authenticated reverse proxy that injects the non-client-shared proxy authentication header; never publish a shared bearer credential or NIM API key in a web page.

## What is real now
- Rule-based natural-language parsing, state/county selection, source-backed public parcel scan, status explanations, local area list and source links.
- Parcel-size comparisons honor "over" vs "at least"; results are not fabricated on network failure.
- Opt-in voice dictation when browser supports it.
- No LLM is executing at GitHub Pages. The NVIDIA UI action is visibly disabled there.

## What is not built
- NVIDIA NIM GPU runtime and provisioned inference credentials
- Secure SSO/tenant-approved hosting
- Nemotron Parse/OCR jobs, cited permit/deed extraction and evidence review
- Nemotron Embed vector database, source-specific provenance/candidate reconciliation
- Automated site/ownership/lease validation or sale willingness
- Nationwide government coverage or a live refresh schedule

## Safe deployment prerequisites
1. Approve vendor/model license and hosting/compute expenses.
2. Configure authenticated HTTPS endpoint, SSO/reverse proxy, secret store, abuse limits and per-user audit.
3. Verify records may be sent to the chosen inference endpoint under provider terms. Prefer self-hosted where needed.
4. Require model output to be explicitly labeled advisory, visibly separate from source facts, and subject to direct source review.
5. Run prompt-injection, adversarial query, privacy, redaction and hallucination tests on public fixtures before enabling user access.

This document describes general public research capability only. Do not include proprietary workflows, curated target portfolios, private lead/contact data, private strategy or private documents in this repository.
