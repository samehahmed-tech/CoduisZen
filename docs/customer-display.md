# Customer Display

RestoFlow now includes a branch-scoped public pickup board at `/customer-display`.

Example URL:

```text
/customer-display?branchId=<BRANCH_ID>&key=<PUBLIC_SCREEN_TOKEN>
```

The board refreshes every five seconds and shows only recent `READY` or `DELIVERED` orders from `TAKEAWAY`, `PICKUP` and `KIOSK`. The API projection contains only `orderNumber`, `status` and `updatedAt`; it never returns customer names, phone numbers, addresses, item lines, payment data or internal order IDs.

## Deployment checklist

1. Set `PUBLIC_SCREEN_TOKEN` in production and keep it out of source control.
2. Use the exact branch ID in the display URL; no default branch is accepted.
3. Host the display on a dedicated browser/device profile and use the browser fullscreen mode.
4. Confirm that the display receives a ready order and that it disappears after the recent-order window.
5. If the screen shows an error, verify the API origin, branch ID, screen token and LAN/firewall access.

This is a customer pickup board, not an operator KDS. Mutating actions remain on the authenticated KDS/packing screens.
