# Lake Salt deterministic pricing model (2026.08)

This model is the shared source of truth for new quote calculations. Accepted historical quotes are immutable. In particular, Alisa Hartline's accepted quote remains **$792** with a **$79.20** deposit; it is a legacy benchmark, not a rate to recalculate.

## Required confirmed scope

A quote cannot be sent until the system knows: total guests, guests receiving drinks, service hours, city or venue, whether alcoholic drinks are included, whether mocktails are included, whether a water/NA station is included, cocktail count and complexity when cocktails are served, built-in versus mobile bar, and travel area. An exact street address is not required.

## Included by default

Disposable cups are included in every new quote and are never presented as an optional upgrade. Standard setup, breakdown, equipment, ice, expendables, and the confirmed drink-service scope are priced into the service. Alcohol remains client-provided under Lake Salt's dry-hire model.

## Calculation

1. Determine staffing from beverage guests and service complexity (one bartender per 75 guests for beer/wine, 60 for standard cocktails, or 50 for complex/three-plus cocktail menus). An admin may increase staffing.
2. Add transparent operating costs: flat bartender compensation, setup labor, extra service hours, cups, base consumables, alcoholic-service consumables, mocktail consumables, water station, cocktail count/complexity, equipment/mobile bar, and travel area.
3. Divide operating cost by one minus the target margin (40% private/wedding, 55% corporate).
4. Apply the event minimum ($450 private, $800 wedding, $1,200 corporate), then round up to the nearest $5.
5. Add optional gratuity separately. Gratuity is treated as staff compensation, not Lake Salt profit.
6. Calculate the 10% deposit from the client total.

The result exposes every cost component, service revenue, gratuity, deposit, operating profit, and achieved margin. Client-facing documents should show inclusions and the final price; internal CRM views may show the full cost/profit breakdown.

## Acceptance-rule verification

The pricing integration test asserts that public acceptance requires the existing quote status to be `sent`. A local Firestore emulator compile/start was attempted with `firebase emulators:exec --only firestore "true"`, but this machine does not currently have the Java runtime required by the emulator. Install Java and rerun that command before deployment when emulator-level rule execution is required.
