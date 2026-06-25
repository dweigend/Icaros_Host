# Client Connection Guide

Purpose: point Host maintainers and client authors to the canonical external
client integration guide while keeping the Host-side runtime contract easy to
find. This page does not duplicate the full client tutorial.

## Canonical Client Reference

Use the dedicated client reference repository for implementation examples:

- [ICAROS Client Connection Guide](https://github.com/dweigend/ICAROS_Client_Erstellen/blob/main/Host_Verbindung_Anleitung.md)
- [ICAROS_Client_Erstellen repository](https://github.com/dweigend/ICAROS_Client_Erstellen)

That repository contains minimal TypeScript examples for:

- registering a launch client with `/ws/runtime`
- sending `client.hello` and `client.heartbeat`
- reading normalized controls from `/ws/control/main`
- validating `control.orientation`
- avoiding direct M5 access

It is a reference, not a full WebXR app or framework template.

## Host-Side Contract

External experience clients receive one Host HTTPS origin, for example:

```txt
https://<host-lan-ip-or-name>:5183
```

From that origin they derive:

| Purpose | URL |
| --- | --- |
| Runtime registration | `wss://<host-lan-ip-or-name>:5183/ws/runtime` |
| Control stream | `wss://<host-lan-ip-or-name>:5183/ws/control/main` |
| Headset launch entrypoint | `https://<host-lan-ip-or-name>:5183/launch` |

The client itself must serve its own HTTPS page, for example:

```txt
https://<client-lan-ip-or-name>:5174/
```

The URL sent in `client.hello.payload.url` must be that reachable HTTPS client
URL. `/launch` belongs to the Host and redirects to the selected registered
client. Never append `/launch` to the client port.

## Boundaries

Clients must:

- consume only normalized `control.orientation` values
- treat `quality: 0` as neutral or unavailable control input
- keep sockets, intervals, event listeners, and render loops disposable
- use HTTPS/WSS for browser, headset, and WebXR surfaces

Clients must not:

- connect directly to the M5
- open `/ws/device`
- call `/api/m5-pairing`
- parse raw M5 data
- implement a separate pitch/roll normalization pipeline

For exact message shapes, see [client-api.md](client-api.md).
