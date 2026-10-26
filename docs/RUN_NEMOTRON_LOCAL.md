# Run an actual NVIDIA Nemotron model (local setup, not GitHub Pages)

The public web application is hosted as static files. **GitHub Pages does not run a language model or this gateway.** The repository contains a working server-side adapter for either an OpenAI-compatible NVIDIA NIM endpoint or Ollama's local Nemotron 3 Nano model, but inference is opt-in, disabled by default, and requires an authenticated host.

## NVIDIA open-weight model option

- Model: [Nemotron 3 Nano 4B for Ollama](https://ollama.com/library/nemotron-3-nano:4b).
- Download command on an approved development computer: `ollama pull nemotron-3-nano:4b`.
- Test in a terminal: `ollama run nemotron-3-nano:4b`.
- Approximate model download: 2.8 GB; the actual memory/compute footprint may be larger. Hardware availability and workplace software restrictions still apply.
- No API key is needed for a loopback Ollama installation. The model's terms must be checked separately before company production use.
- Ollama's default API listens at `127.0.0.1:11434` and exposes `/api/chat`. **Do not set Ollama to listen on all network interfaces, and do not enable wildcard cross-origin access.**

## Server-to-model integration

The maintained `server/nemotron-gateway.mjs` supports:

| Variable | Description |
| --- | --- |
| `RADAR_INFERENCE_ENGINE=ollama` | Calls the local Ollama `/api/chat` endpoint |
| `NIM_BASE_URL=http://127.0.0.1:11434` | Local inference address |
| `NIM_MODEL=nemotron-3-nano:4b` | Quantized NVIDIA model tag |
| `RADAR_AGENT_ENABLED=1` | Explicit opt-in for the authenticated gateway |
| `RADAR_PROXY_SECRET=<high-entropy-server-only-secret>` | Shared only between company SSO reverse proxy and private gateway, **never put in the browser** |
| `RADAR_ALLOWED_ORIGIN=https://your-approved-private-host.example` | Expected origin for same-origin host |
| `RADAR_AGENT_PORT=8787` | Local gateway port; binds only `127.0.0.1` |

A private reverse proxy must authenticate the user, remove any client-supplied `x-radar-auth` header, and insert the server-only proxy authentication header. It then routes `/api/radar-agent` to the loopback gateway. Enable `window.RADAR_NIM_GATEWAY_ACTIVE=true` only on the approved private-host build, after authentication, logging, abuse controls, and privacy reviews.

**Do not simply copy the token or API key into GitHub Pages.** The public site's NVIDIA button intentionally remains disabled. Inference isn't "integrated" for executives until a real hosted model, verified auth path, and on-device calls all pass.

## Data and accuracy boundary

- The gateway only accepts up to 25 public parcels at a time, with an allowlist for parcel ID, address, state, assessment class, acreage and year built. It drops names, contacts, mailing addresses and financial values.
- Model output is explicitly labeled AI-generated interpretation and must cite the public source link. The model **cannot verify** title, zoning, owner control, leases, acquisition availability, opportunity-zone designation or record freshness from its own weights.
- Source-grounded parcel retrieval, state/county validation and failure handling remain deterministic; the LLM is an explanation and query-planning layer, not the data authority.
- No comps or internal source files should be included in this public repository.

## Future verified deployment path
1. Obtain an IT-approved host and separate service identity. Protect the site with organization-managed SSO before real internal data is considered.
2. Run and benchmark Nemotron locally with synthetic/public fixtures.
3. Place the gateway behind a trusted reverse proxy and enforce per-user access logging, rate limits, and CSP.
4. Validate a source-backed inquiry and model answer from a different test user on an iPhone.
