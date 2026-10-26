# Hosted research assistant: administrator setup

Executives see **Explain these results** and **Radar summary**. The interface exposes no provider/model names, GPU requirements, download controls, keys or infrastructure errors. There is no browser model worker or local model download.

```text
Browser -> authenticated same-origin /api/radar-agent
        -> NVIDIA hosted HTTPS chat-completions API
        -> explanation + source link + observation date
```

The server handles inference. Laptop GPUs, model installation and multi-gigabyte downloads are not required. Normal connectivity is still needed for maps, searches and summaries.

## Obtain and configure API access

1. An authorized administrator signs in to [NVIDIA's API catalog](https://build.nvidia.com/) and selects a hosted text-generation model available to the account. Confirm terms, credits/limits, retention and intended use. No current free allowance, price or model availability is assumed here.
2. Generate an API key through that service. Enter it securely as **`NIM_API_KEY`** in environment settings/your server secret manager. Never paste it into chat, source code, browser settings or a committed file.
3. The live-tested default is **`nvidia/nemotron-3.5-lightning-30b-a3b`**. `NIM_MODEL` can override it with an approved hosted model ID. The earlier recommended `nvidia/nemotron-nano-3-30b-a3b` selection returned a missing inference function for this account; the app migrates that exact saved selection to the tested default automatically. No settings change is required for that migration. A download filename or model-repository path is not automatically an API model ID.
4. Allow outbound HTTPS to **`integrate.api.nvidia.com`**. The application uses `https://integrate.api.nvidia.com/v1/chat/completions`, preserves TLS verification and refuses redirects. Keys are never sent to user-selected URLs. Older settings `NIM_BASE_URL`, `RADAR_INFERENCE_ENGINE`, GPU services and model-runner commands are not used.
5. Run the server described in [DEVELOPMENT.md](DEVELOPMENT.md), with a securely configured `RADAR_WORKSPACE_PASSWORD` for the single-user development login. Executive deployment needs an approved persistent HTTPS host and organizational access controls. Do not expose the loopback service directly or use an onboarding terminal as a production host.
6. Restart after changing runtime settings. Check an authenticated `GET /api/radar-agent/status`, complete a real public scan and select **Explain these results**. Verify the answer and source links. Configuration presence alone does not establish valid credentials, model access or connectivity.

The cloud environment draft declares the key destination and model setting. A draft save does not issue a key, select a model, apply runtime settings, host the app or publish a site. Review/save it and publish the environment through its settings when ready. Website deployment remains separate.

## Authentication and deployment

Routes live in `server/workspace.mjs`, behind workspace authentication and same-origin checks. Browsers send no provider credentials. The old standalone gateway and proxy-secret flow were removed.

Static GitHub Pages cannot execute these routes. Static-only deployments still support deterministic parcel search, with summaries disabled and a neutral status. Production must route frontend and `/api/` through the approved authenticated host/reverse proxy. Direct cross-origin browser calls to the provider are unsupported.

The server has one shared development identity, not enterprise SSO or tenant isolation. No production deployment was performed.

## Data and operational limits

- Only completed public scans can be summarized. Partial, failed, cancelled and identify-only results are not treated as complete scans.
- At most 25 visible records are sent: ID/key/jurisdiction, address, state, assessment class, acreage and year built. The question, source URL, retrieval time and visible count accompany them.
- Owner lookups, private notes, raw attributes, licensed histories, uploaded/recovered files, portfolio/target records and contacts are excluded from the automatic payload.
- Larger scans are labeled as sampled explanations, not exhaustive rankings. Output is advisory, not independent title, zoning, lease, environmental or feasibility verification.
- Limits: 20-second upstream timeout, 35 KB request body, 600 output tokens, no automatic retries, 12 requests/minute and two concurrent requests per process. Multi-instance production needs shared quotas if required.
- Raw provider errors/metadata are not returned. Hidden reasoning is stripped. Responses exposing provider/runner branding are rejected with a neutral message. Scan changes cancel/discard outstanding answers.

## Verification and remaining prerequisites

Synthetic unit/integration/browser tests cover request construction, credential placement, field filtering, source validation, auth, same-origin checks, timeouts, quotas, failures and successful frontend summaries without branding or downloads.

**Live hosted inference verified on 2026-10-26 in the cloud development environment.** After saved credentials reached the runtime, a synthetic parcel summary succeeded through both the assistant service and the real authenticated `/api/radar-agent` route (HTTP 200, generated answer and preserved source link). Only synthetic public-schema test fixtures were sent; no uploaded/private records were used. The tested default disables hidden thinking for concise summaries, and the server HTTP client respects environment proxy settings with TLS verification intact. This verifies the inference connection and backend path, not real parcel accuracy, a deployed executive website or production SSO. An approved persistent deployment is still needed for executive use.
