# Icaros Host Plan

Purpose: this document captures the current MVP implementation plan so a fresh
agent can continue without reintroducing removed routes or dashboard complexity.
Operational LAN, HTTPS, and Quest launch details live in
[Quest HTTPS Launch Routing](quest-https-launch-routing.md).

## Current Goal

Build one local station host with one integrated terminal-style console page.
The host is still a router, gateway, and translator, but the UI is deliberately
small:

- `/` is the only SvelteKit page.
- No `/operator` UI route.
- No `/vr` UI route.
- No `/api/*` UI helper endpoints. `/api/m5-pairing` may exist only as a
  diagnostics adapter for CLI and automation.
- No `/experiences/*` static serving route in this slice.
- `/launch` redirects to the selected online runtime client's registered HTTPS
  URL.

## Locked MVP Decisions

- Stack: Bun, SvelteKit, TypeScript strict, Biome, Bits UI.
- UI: one page, terminal look, dense and technical.
- Station model: one station, `station-a`.
- Active state: one concrete `activeClientId` as the routing source of truth,
  plus derived `activeExperienceId` compatibility state.
- Quest support: Meta Quest opens host and WebXR browser clients over HTTPS.
- Experience clients: browser/WebXR clients open directly or through `/launch`,
  then register over `/ws/runtime`.
- Active selection: operator selects a concrete runtime client on `/`.
- M5 input: raw frames connect to `/ws/device`.
- Control clients: subscribe to `/ws/control/main`; HTTPS clients use WSS.
- Runtime clients: optionally connect to `/ws/runtime` for launch selection;
  HTTPS clients use WSS.
- Experience API: normalized `pitch` and `roll` in `-1..1`, `quality` in
  `0..1`, and required `safeMode`.

## Setup Constraint: LAN Origin And Form Actions

The operator console should use one stable origin during a session. Mixing
`localhost` and the Mac's LAN address can trigger SvelteKit's cross-site form
POST protection when the active runtime client action is submitted, for example:

```txt
https://192.168.50.194:5183/?/setActive
Cross-site POST form submissions are forbidden
```

Project impact:

- The operator may be unable to set or clear `activeClientId`.
- `/launch` then cannot reliably route the Meta Quest to the selected runtime
  client.
- This is an origin/deployment issue around the SvelteKit form action, not an
  M5 protocol, WebSocket runtime, or experience-client problem.
- The issue is especially relevant because the MVP must work from LAN devices,
  not only from `localhost`.

Minimum viable setup:

- Use one stable host origin for the operator console during a session, for
  example `https://192.168.50.194:5183/`, and avoid mixing it with
  `https://localhost:5183/`.
- Keep CSRF protection enabled by default.
- Configure dev and future deployment paths so the operator UI, `/launch`, and
  `/ws/runtime` derive URLs from the same explicit host origin.
- Only add a narrow development workaround if the LAN setup cannot be made
  consistent through normal origin and runtime-origin configuration.

## Message Contract

All non-M5 runtime messages use one shared envelope:

```ts
type Message<TPayload> = {
  protocol: "neural-flight.v1";
  type: string;
  stationId: "station-a";
  source: {
    role: "host" | "operator" | "quest" | "experience" | "m5";
    id: string;
  };
  timestamp: number;
  payload: TPayload;
};
```

Public message types:

- `client.hello`
- `client.heartbeat`
- `client.registered`
- `client.rejected`
- `runtime.clients`
- `station.state`
- `control.orientation`

Experience clients subscribe to public control streams for control data. They
use `client.hello` plus `client.heartbeat` only when they should appear in the
Host launch selection. Diagnostic operator taps use
`operator.diagnostic.register` and are not part of the public experience-client
contract.

## Experience Routing

The host does not serve experience assets in this slice. Experiences run as
browser/WebXR clients, connect to `/ws/runtime`, and send `client.hello` with
their stable `clientId`, `experienceId`, title, and HTTPS URL.

The operator selects one concrete online runtime client in the console for
launch routing. The Host sets `activeClientId`, derives `activeExperienceId`
from that client for compatibility, and redirects `/launch` to the selected
client's registered HTTPS URL. Control delivery is a separate public stream
contract owned by `/ws/control/main`.

Detailed LAN URLs, certificate setup, environment variables, and launch
troubleshooting live in
[Quest HTTPS Launch Routing](quest-https-launch-routing.md).

## TODO

- Follow [Quest HTTPS Launch Routing](quest-https-launch-routing.md) for Host
  and standalone client certificates, mkcert trust on Quest, and LAN-safe
  start commands.
- Start the standalone experience client so it registers with `client.hello`
  and advertises an HTTPS `url`.
- Select the concrete runtime client in the host console from one stable LAN
  origin.
- Verify that `https://<host-lan-ip-or-name>:5183/launch` returns a `307`
  redirect to the selected runtime client's registered HTTPS URL.
- Verify that `/launch` fails clearly when no client is selected, the selected
  client is stale, or the selected client registered a non-HTTPS URL.
- Open the launch URL on the Quest and confirm the WebXR experience connects to
  `wss://<host-lan-ip-or-name>:5183/ws/runtime`.
- Add or keep automated coverage for selected-client launch routing, stale
  client handling, non-HTTPS rejection, and active-client control routing.

## Runtime Flow

1. Host starts.
2. Operator opens `/`.
3. Console shows station state and runtime connection URLs.
4. Runtime clients connect with `client.hello` and appear in the console.
5. The Meta Quest opens `/launch` and is redirected to the selected WebXR
   client's registered HTTPS URL.
6. M5 connects to `/ws/device`.
7. Operator selects the active concrete runtime client.
8. Host forwards `station.state` and `runtime.clients` to runtime clients.
9. Host forwards `control.orientation` only to the active runtime client.
10. Stale or disconnected M5 state produces neutral safe-mode controls.

## Acceptance Criteria

- One page shows station status and runtime connection URLs.
- `/launch` redirects to the selected online runtime client's registered HTTPS
  URL.
- Meta Quest can reach the host or active WebXR experience over HTTPS.
- HTTPS runtime clients use WSS for `/ws/runtime`.
- Operator can set and clear the active concrete runtime client.
- A simulated M5 can drive normalized control data.
- Active registered runtime client receives `control.orientation`.
- Stale/disconnected M5 state produces safe neutral controls.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
