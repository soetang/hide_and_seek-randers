# DAGI opstillingskredse

## Overview

`Opstillingskreds` is the official DAGI constituency layer used for Folketing election geography.

It is a reasonable optional comparison layer for the interactive map.

## Relevant fields / data model

Important fields include:

- `opstillingskredsnummer`
- `valgkredsnummer`
- `storkredsnummer`
- `navn`
- polygon geometry
- validity and registration metadata

## How we would use it in the web app

- optional alternate area layer
- point-in-polygon lookup for searched/GPS locations
- comparison against sogn/postnummer if needed for gameplay reasoning

## Licensing / attribution

DAGI data is covered by **CC BY 4.0** and should be attributed to **Klimadatastyrelsen / Datafordeler**.

## Risks / open questions

- Exact service/layer details should be confirmed before ingestion
- Some official service variants are being phased out in 2026
- This layer is lower priority than the municipality boundary, parishes, and transit data

## Recommendation for this project

Keep this as a **secondary optional layer**.

It should be included only after the core parish and transit flows are working.
