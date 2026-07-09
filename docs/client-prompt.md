# Experience Client Prompt

Purpose: copyable implementation prompt for integrating Icaros Host
communication into an external Three.js/WebXR experience client. The canonical
runtime contract is [client-api.md](client-api.md); Quest, HTTPS, and launch
operations are described in
[quest-https-launch-routing.md](quest-https-launch-routing.md).

Build an external Three.js/WebXR experience for Icaros Host.

## Goal

The client serves its own HTTPS page for the VR experience. It registers that
HTTPS URL with the Host so the headset can open the fixed Host `/launch` URL and
be redirected to the selected registered client.

The client receives controls through WebSocket:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

The Host sends `control.orientation` messages:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	buttonPressed: boolean;
	buttonDown: boolean;
	buttonUp: boolean;
	controllerType: 'm5';
}>;
```

`pitch` is forward/backward tilt. `roll` is side tilt. Both values are already
cleaned, smoothed, protected, and normalized to `-1..1`. `quality` is `0..1`
and indicates whether the control data is reliable.

## Example Values

- `experienceId`: `mountain-flight`
- title: `Mountain Flight`
- Host origin: `https://<host-lan-ip-or-name>:5183`
- client URL: `https://<client-lan-ip-or-name>:5174/`
- control socket: `wss://<host-lan-ip-or-name>:5183/ws/control/main`
- optional runtime socket: `wss://<host-lan-ip-or-name>:5183/ws/runtime`
- headset entrypoint: `https://<host-lan-ip-or-name>:5183/launch`

For local desktop development, the client may run on
`https://localhost:5174/`. For Quest or LAN tests, the URL registered in
`client.hello` must be reachable from the headset, for example
`https://<client-lan-ip-or-name>:5174/`. From the Quest's point of view,
`localhost` is the headset itself, not the development machine.

## What The Client Must Build

The client must serve an HTTPS page, for example:

```txt
https://<client-lan-ip-or-name>:5174/
```

That page renders the experience that the headset eventually opens. The client
registers its reachable HTTPS URL with the Host so the Host can offer it as a
launch target.

The client must open the control socket on startup:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

Validate incoming messages and use only `control.orientation` for controls. If
`quality` is `0`, keep movement neutral, fade control input out, or stop safely.

Important: the Host already cleans, smooths, and protects controller data on the
server side. The safety logic lives in
[safety.ts](../src/lib/server/control/safety.ts). Do not rebuild that logic in
the client. Use the emitted `pitch`, `roll`, `quality`, and button values.

## Optional Launch Registration

If the client should appear in the Host console launch selection, it must also
register over:

```txt
wss://<host-lan-ip-or-name>:5183/ws/runtime
```

Immediately after opening the socket, send `client.hello`:

```json
{
  "protocol": "neural-flight.v1",
  "type": "client.hello",
  "stationId": "station-a",
  "source": { "role": "experience", "id": "<clientId>" },
  "timestamp": 1760000000000,
  "payload": {
    "role": "experience",
    "clientId": "<clientId>",
    "experienceId": "mountain-flight",
    "title": "Mountain Flight",
    "url": "https://<client-lan-ip-or-name>:5174/",
    "userAgent": "<navigator.userAgent>"
  }
}
```

Then send `client.heartbeat` every 3 to 5 seconds:

```json
{
  "protocol": "neural-flight.v1",
  "type": "client.heartbeat",
  "stationId": "station-a",
  "source": { "role": "experience", "id": "<clientId>" },
  "timestamp": 1760000004000,
  "payload": { "clientId": "<clientId>" }
}
```

`clientId` identifies one concrete browser or headset instance. `experienceId`
is the stable experience slug. `url` must be the HTTPS URL of the client page.
HTTP URLs are rejected by the Host.

## Launch Rules

The headset uses this fixed Host URL:

```txt
https://<host-lan-ip-or-name>:5183/launch
```

The Host takes the currently selected online runtime client and redirects the
headset to that client's registered HTTPS URL. `/launch` always belongs to the
Host, never to the client port.

If no client is selected, the selected client is offline, or no HTTPS URL is
registered, `/launch` must fail clearly. Do not build a client-side fallback for
this.

## Boundaries

- Do not connect directly to the M5 device.
- Do not open `/ws/device`.
- Do not call `/api/m5-pairing`.
- Do not parse raw M5 data.
- Do not rebuild pitch/roll normalization in the client.
- Use HTTPS and WSS for browser, Quest, and WebXR surfaces.
- Only the Host's M5 device boundary may use plain `ws://`.

## Code Expectations

Build only what the client needs: HTTPS page, WebXR/Three.js experience,
control WebSocket, and optional runtime registration.

Keep Host origin, experience ID, title, and client URL easy to configure. Clean
up WebSockets, intervals, event listeners, and render loops with `dispose()`.

For minimal TypeScript examples, use the
[ICAROS Client Connection Guide](https://github.com/dweigend/ICAROS_Client_Erstellen/blob/main/Host_Verbindung_Anleitung.md).
