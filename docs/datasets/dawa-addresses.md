# DAWA address search

## Overview

DAWA provides Danish address autocomplete, lookup, and reverse-address functionality.

It is a very good conceptual fit for typed address search and GPS-based address resolution, but there is a major lifecycle issue: **DAWA is documented to shut down on 1 July 2026**.

## Relevant endpoints

- `/autocomplete`
- `/adresser`
- `/adresser/{id}`
- `/adgangsadresser`
- `/adgangsadresser/{id}`
- `/adgangsadresser/reverse`
- `/datavask/adresser`

## How we would use it in the web app

- typed address search via `/autocomplete`
- pasted-address cleanup via `/datavask/adresser`
- GPS-to-nearest-address via `/adgangsadresser/reverse`

## Risks / open questions

- **Critical:** DAWA closes on **2026-07-01**
- Replacement strategy is not yet locked in
- Reverse lookup is address-entry focused and may need a second step for full address resolution

## Recommendation for this project

DAWA is acceptable only as a **short-lived bridge**.

If used, structure the app so the address provider can later be swapped out. Do not build long-term assumptions around DAWA remaining available.
