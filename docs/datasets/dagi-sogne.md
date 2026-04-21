# DAGI sogne

## Overview

`Sogneinddeling` is the official DAGI parish boundary dataset.

It is the correct authoritative source for determining which **sogn** a location belongs to.

## Relevant fields / data model

Important fields include:

- `sognekode`
- `navn`
- polygon geometry
- validity and registration timestamps
- DAGI administrative identifiers

The public DAWA-style endpoint also exposes simplified fields such as `kode`, `navn`, `bbox`, `visueltcenter`, and `dagi_id`.

## How we would use it in the web app

- point-in-polygon lookup for GPS results
- point-in-polygon lookup for searched addresses
- overlay of parish boundaries in the interactive map
- highlight the current parish after lookup

## Licensing / attribution

DAGI data is documented as **CC BY 4.0** with attribution to **Klimadatastyrelsen**.

## Risks / open questions

- Some Datafordeler interfaces are being phased out during 2026
- Source geometry should be downloaded and processed once, not fetched live for every user interaction
- Generalized scales may lag behind updates; source scale choice matters

## Recommendation for this project

Use DAGI `Sogneinddeling` as the **source of truth** for parish lookup and parish overlays.

Preprocess and simplify it into a local static dataset for the web app.
