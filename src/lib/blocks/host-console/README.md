# host-console

Purpose: composed single-page operator console for the Icaros Host MVP.

This block owns the dense technical layout for `/`. It does not own station
state, form validation, or WebSocket runtime behavior.

It may display launch and socket URLs resolved by the route loader. The block
does not resolve LAN addresses or experience targets itself.

The runtime debug panel opens a browser-side `/ws/runtime` tap for the active
experience id and visualizes normalized `control.orientation` frames only. It
does not read raw M5 frames and does not add a separate debug route.

The M5 USB setup panel starts a server-side diagnostic script through the
single page form action. It reads serial JSON from the attached controller and
shows a constant-size pairing snapshot on `/`. It requires SSID and password,
writes the paired device WebSocket URL to the controller over USB, and only
turns green after the paired controller sends a WebSocket frame over WLAN/LAN.
WiFi passwords and pairing tokens are not written to page data or logs.
