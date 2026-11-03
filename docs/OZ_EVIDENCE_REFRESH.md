# Official nomination evidence refresh

`Refresh official state nomination evidence` runs on Mondays at 11:17 UTC and can be run manually from GitHub Actions. It also runs when its workflow, refresh script or integrity tests change. Currently it refreshes **New Jersey only**. PA is pending verification of the DCED map's service schema and tract export; Florida is pending a connected official tract feed.

Manual equivalent:

```sh
python3 scripts/build-nj-oz-nominations.py
```

The script validates the official layer's polygon schema, required fields, expected 130-record scope, complete response, unique NJ tract and record IDs, and stable source edit timestamp. A failure leaves the existing bundle untouched and fails the workflow. Review a changed count/schema before updating the configured guard. Existing evidence still expires normally; a failed fetch cannot extend its validity.

A successful weekly check with unchanged facts creates no commit. Changed source facts are committed immediately; unchanged evidence is renewed when 30 days or less remain, for a further 89 days. That renewal is necessary even if the tract membership has not changed. This avoids weekly timestamp-only commits without allowing the labels to expire. Source check dates displayed in the app remain the last persisted successful verification dates, not necessarily the latest no-change job run.

The workflow stages only `assets/data/oz-designation-evidence.json`. It runs unit tests and the public build before committing. Since commits made using `GITHUB_TOKEN` do not trigger push workflows, it explicitly dispatches the existing Pages workflow, which runs all registered browser suites before publication. Repository Actions must permit contents writes and workflow dispatch; protected-branch rules can reject the update rather than allowing a bypass. No personal access token is required.

The refresher preserves evidence from other states and any future, separately verified federal feed. It **never changes state nominations to federal certifications**. Treasury/IRS publication will require a separately reviewed federal source, exact tract/round joins and source dates. Refreshing NJ cannot settle Florida status or prove that an unlisted parcel is ineligible. Third-party reports about submission counts and federal deadlines are research leads, not certified tract evidence.

For PA, the supplied official starting point is DCED's Qualified Opportunity Zones page and its map app `ac1b9b69147f4229b9d8598817e79436`. The workspace returned HTTP 403 when reading the app's configuration, so the reported 218 tracts, Lehigh Valley counts and absence near Easton were not independently confirmed or published as facts in this change. A readable service schema/export is needed before connecting the PA overlay and selected-parcel checks.
