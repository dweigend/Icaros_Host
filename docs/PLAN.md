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
- No `/api/*` UI helper endpoints.
- No `/experiences/*` static serving route in this slice.
- `/launch` redirects to the externally running active experience.

## Locked MVP Decisions

- Stack: Bun, SvelteKit, TypeScript strict, Biome, Bits UI.
- UI: one page, terminal look, dense and technical.
- Station model: one station, `station-a`.
- Active state: one server-side `activeExperienceId` plus one concrete
  `activeClientId`.
- Quest support: Meta Quest opens host and WebXR browser clients over HTTPS.
- Experience clients: browser/WebXR clients open directly or through `/launch`,
  then register over `/ws/runtime`.
- Active selection: operator selects a concrete runtime client on `/`;
  `activeExperienceId` remains the launch-compatible experience id.
- M5 input: raw frames connect to `/ws/device`.
- Runtime clients: connect to `/ws/runtime`; HTTPS clients use WSS.
- Experience API: normalized `pitch` and `roll` in `-1..1`.

## Setup Constraint: LAN Origin And Form Actions

The operator console should use one stable origin during a session. Mixing
`localhost` and the Mac's LAN address can trigger SvelteKit's cross-site form
POST protection when the active experience action is submitted, for example:

```txt
https://192.168.50.194:5183/?/setActive
Cross-site POST form submissions are forbidden
```

Project impact:

- The operator may be unable to set or clear `activeExperienceId`.
- `/launch` then cannot reliably route the Meta Quest to the selected active
  experience.
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
  consistent through normal origin and proxy configuration.

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

Initial message types:

- `client.hello`
- `client.heartbeat`
- `client.registered`
- `client.rejected`
- `runtime.clients`
- `station.state`
- `control.orientation`
- `client.register` remains a temporary legacy alias for operator diagnostics.

## Experience Routing

The host does not serve experience assets in this slice. Experiences run as
browser/WebXR clients, connect to `/ws/runtime`, and send `client.hello` with
their stable `clientId`, `experienceId`, title, and HTTPS URL.

The Meta Quest remains a supported runtime device. It opens the host console or
active WebXR experience over HTTPS. `/launch` redirects to the active experience
client URL only when an HTTPS target is configured. There is no HTTP default or
fallback. `bun start` supplies `ICAROS_EXPERIENCE_PROTOCOL=https` for the
same-host client target; separate Quest/LAN client machines should use
`ICAROS_EXPERIENCE_ORIGIN=https://...`.

The Quest launch URL itself is always the HTTPS Host endpoint
`https://<host-lan-ip-or-name>:5183/launch`. The experience client URL is
separate, commonly `https://<client-lan-ip-or-name>:5174/` for Quest/WebXR, and
must never be shown with a `/launch` path. Client URLs must use HTTPS.

The operator selects one concrete online runtime client in the console. The host
sets `activeClientId` and derives `activeExperienceId` from that client. The
host forwards `control.orientation` only to the selected `activeClientId`.

## TODO

- Create local HTTPS certificates for the Host LAN address with `mkcert` and
  store them in the Host repo at `.certs/icaros-host.pem` and
  `.certs/icaros-host-key.pem`.
- Create autonomous HTTPS certificates for the standalone VR client in the
  Client repo with `bun run setup:https`. Do not reuse or symlink Host
  certificate files.
- Install the mkcert root CA on the Meta Quest so the headset trusts
  `https://<host-lan-ip-or-name>:5183/launch` and the redirected client origin.
- Restart the host with
  `ICAROS_EXPERIENCE_ORIGIN=https://<client-lan-ip-or-name>:5174 bun start`
  and confirm it listens on `https://0.0.0.0:5183` when certificates are
  present.
- Start the standalone experience client on port `5174` with
  `ICAROS_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183` and keep
  `/ws/runtime` proxied back to the host.
- Select the concrete runtime client in the host console from one stable LAN
  origin.
- Verify that `https://<host-lan-ip-or-name>:5183/launch` returns a `307`
  redirect to `https://<client-lan-ip-or-name>:5174/` only after the standalone
  client runs with TLS and the host is started with
  `ICAROS_EXPERIENCE_ORIGIN=https://<client-lan-ip-or-name>:5174`.
- Verify that `/launch` returns `500` with a configuration message when no
  HTTPS experience target is configured.
- Open the launch URL on the Quest and confirm the WebXR experience connects to
  `/ws/runtime` with WSS.
- Add or keep automated coverage for default launch URL resolution, missing
  active experience handling, and configured experience origin/path overrides.

## Runtime Flow

1. Host starts.
2. Operator opens `/`.
3. Console shows station state and runtime connection URLs.
4. Runtime clients connect with `client.hello` and appear in the console.
5. The Meta Quest opens `/launch` and is redirected to the active WebXR client.
6. M5 connects to `/ws/device`.
7. Operator selects the active concrete runtime client.
8. Host forwards `station.state` and `runtime.clients` to runtime clients.
9. Host forwards `control.orientation` only to the active runtime client.
10. Stale or disconnected M5 state produces neutral safe-mode controls.

## Acceptance Criteria

- One page shows station status and runtime connection URLs.
- `/launch` redirects to the configured active experience URL.
- Meta Quest can reach the host or active WebXR experience over HTTPS.
- HTTPS runtime clients use WSS for `/ws/runtime`.
- Operator can set and clear the active concrete runtime client.
- A simulated M5 can drive normalized control data.
- Active registered runtime client receives `control.orientation`.
- Stale/disconnected M5 state produces safe neutral controls.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
