# Rental Inventory Website

The counter and administration client, separate from the companion apps in `../mobile/`, in the same repository.

Enter or scan a guest pass to open/resume checkout immediately, without a pass-confirmation dialog. Equipment confirmation, due-date review, return-all confirmation and administrator deletion confirmation remain explicit steps.

Website-only tools: inventory creation and management, full database administration/export, and individual or mixed-sheet barcode printing. Companion apps retain their mobile scanning confirmations and operational lookup/checkout/return screens.

Use the shared Worker API in `../worker/`. Never duplicate rental-status, due-date or equipment-assignment rules in a separate backend. Deploy this directory to the existing website; mobile releases are independent.
