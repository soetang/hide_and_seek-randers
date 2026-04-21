# Official Danish basemap options

## Overview

The strongest official Danish basemap candidates found so far are Dataforsyningen / Klimadatastyrelsen map products such as:

- `Natur- og Friluftskort`
- `Kort25`
- `Ortofoto forår`

## Available source / material

- `Natur- og Friluftskort`: strong outdoor/contextual map
- `Kort25`: more neutral topographic map
- `Ortofoto forår`: aerial imagery

## How we could use it

- default web basemap: likely `Natur- og Friluftskort` or `Kort25`
- optional imagery toggle: `Ortofoto forår`
- printable map: likely avoid depending too heavily on a live basemap and prioritize our own overlays

## Licensing / attribution

These map products are part of Denmark’s public geodata ecosystem and should be attributed to **Klimadatastyrelsen / Dataforsyningen**.

## Risks / open questions

- Most Dataforsyningen services appear to require token-based access
- CRS/projection details need attention in implementation
- WMS may be heavier than ideal for a static mobile-first app
- Public-token handling may be awkward for GitHub Pages hosting

## Recommendation for this project

Use an official Danish basemap only if the access method is operationally simple enough.

For v1, the safer path may be:

- strong local overlays
- optional basemap if credentials/terms are manageable
- print output that does not depend on live basemap availability
