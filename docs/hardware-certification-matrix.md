# Hardware certification matrix

This matrix separates what RestoFlow can prove in CI from what must be verified on the target hardware. A passing automated harness is protocol and policy evidence; it is not a claim that every printer, drawer, scanner or scale has been physically certified.

Run the deterministic checks with:

```text
npm run hardware:certify
```

| Capability | Automated evidence | Physical acceptance evidence |
| --- | --- | --- |
| Local/Windows/USB receipt printer | Offline routing policy and bridge contract | Receipt layout, Arabic glyphs, cutter and retry verified on the model |
| Network/LAN printer | Explicitly excluded from direct-offline path | Queue delivery, timeout, duplicate prevention and outage recovery |
| ESC/POS cash drawer | Pulse bytes are deterministic (`1B 70 00 19 FA`) | One pulse opens the connected drawer and does not open it twice |
| HID/EAN-13 scanner | Check-digit validation | Printed, damaged and fast consecutive scans on the target model |
| Scale | Stable/unstable frames and g/kg/lb/oz conversions | Calibration against known weights and stable-frame acceptance |

## Certification evidence to attach per model

1. Model, firmware, connection type and operating system.
2. Test date, branch/device identifier and bridge version.
3. Receipt or scan sample, known-weight result, and drawer-open result.
4. Failure/retry result with the network or device disconnected.
5. Operator sign-off. A model remains `PHYSICAL_REQUIRED` until these artifacts exist.

The current bridge exposes printer discovery, health and test-print endpoints on loopback. LAN printers remain server-queued and require a real network test; the offline browser policy intentionally does not pretend that path is available without connectivity.
