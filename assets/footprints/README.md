# Hosted building-footprint extract

Building footprints © Microsoft, ODbL.

Source declared by the supplied package: Microsoft GlobalMLBuildingFootprints,
release 2026-02-03. Source project:
https://github.com/microsoft/GlobalMLBuildingFootprints

This extracted database is offered under the Open Database License (ODbL) 1.0:
https://opendatacommons.org/licenses/odbl/1-0/
Individual database contents are made available under the Database Contents License:
https://opendatacommons.org/licenses/dbcl/1-0/

The user-supplied package was built October 30, 2026. Its 455 XYZ z14 tiles contain
444,978 polygons. Their properties retain only estimated height (`h`) where
provided; the application does not use height to infer floors or total floor area.
All tiles, counts, polygon rings and coordinate bounds are checked during builds.
The manifest declares the upstream source/release; upstream raw download lineage
and original imagery dates were not independently verified in this environment.
An extract's build date or source release is not the date of imagery or proof that
an individual building still exists.

The package selected buildings by their center within 6.5 miles of five supplied
market centers: Edison, Secaucus, North Bergen, Easton and West Palm Beach.
Overlapping market counts must not be added together. Coverage is bounded, not
statewide. The reader stays 0.75 miles inside each extraction circle and reads a
one-tile neighbor buffer, because buildings are filed by center. The margin exceeds
the maximum supplied building bounding-box diagonal. Larger/different footprints
require revalidating this margin when replacing the dataset.

The reader clips and unions footprints to the selected parcel and reports mapped
ground/roof area and coverage. It does not establish total building floor area,
vacancy, usable yard, pavement, legal access, current condition or buildability.
Empty/missing mapping remains unknown. Outside this extract the existing OSM
fallback can be used, with its own attribution and service-availability limits.

Release-time licensing reference:
https://github.com/microsoft/GlobalMLBuildingFootprints/blob/546a582055b203cff683410fc1cd7e6f628ffb2f/LICENSE
Microsoft changed the current project license to CDLA Permissive 2.0 on March 10,
2026 (commit `ef94ee3`). This extract retains its supplied February-release ODbL
label, consistent with the earlier license. See the accompanying full
`LICENSE-ODbL-1.0.txt`. This history check does not independently match the supplied
polygons to the raw upstream February files.
