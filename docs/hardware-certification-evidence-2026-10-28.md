# Hardware certification evidence — 2026-10-28

## Automated gate

Command:

```text
npm run hardware:certify
```

Result: `PASS`.

The automated gate validated:

- Windows/local printer offline policy.
- ESC/POS cash-drawer pulse bytes: `1B 70 00 19 FA`.
- EAN-13 check-digit validation.
- Stable/unstable scale-frame parsing and unit conversion.
- Explicit separation between automated evidence and physical certification.

## Current acceptance state

| Capability | Automated gate | Physical acceptance |
|---|---|---|
| Receipt printer | Passed | Pending print sample, Arabic glyphs, cutter, retry |
| Network/LAN printer | Passed policy gate | Required: queue, timeout, duplicate prevention, outage recovery |
| Cash drawer | Passed pulse simulation | Pending one-pulse physical open test |
| Barcode scanner | Passed EAN-13 validation | Pending printed/damaged-label scan on target model |
| Scale | Passed parser/conversion gate | Required: calibration and stable-frame acceptance |

This document is evidence of the automated gate only. It does not certify a physical device or model.
