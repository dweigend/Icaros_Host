# host-console

Purpose: composed single-page operator console for the Icaros Host MVP.

This block owns the dense technical layout for `/`. It does not own station
state, form validation, or WebSocket runtime behavior.

It may display launch and socket URLs resolved by the route loader. The block
does not resolve LAN addresses or experience targets itself.
