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
- Active state: one server-side `activeExperienceId`.
- Quest support: Meta Quest opens host and WebXR browser clients over HTTPS.
- Experience clients: browser/WebXR clients open directly or through `/launch`,
  then register over `/ws/runtime`.
- Active selection: operator sets `activeExperienceId` by id on `/`.
- M5 input: raw frames connect to `/ws/device`.
- Runtime clients: connect to `/ws/runtime`; HTTPS clients use WSS.
- Experience API: normalized `pitch` and `roll` in `-1..1`.

## Setup Constraint: LAN Origin And Form Actions

The operator console should use one stable origin during a session. Mixing
`localhost` and the Mac's LAN address can trigger SvelteKit's cross-site form
POST protection when the active experience action is submitted, for example:

```txt
http://192.168.50.194:5183/?/setActive
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
  example `http://192.168.50.194:5183/`, and avoid mixing it with
  `http://localhost:5183/`.
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

- `client.register`
- `station.state`
- `control.orientation`
- `experience.ready`

## Experience Routing

The host does not serve experience assets in this slice. Experiences run as
browser/WebXR clients, connect to `/ws/runtime`, and send `client.register` with
their `experienceId`.

The Meta Quest remains a supported runtime device. It opens the host console or
active WebXR experience over HTTPS. `/launch` redirects to the active experience
client URL. The default target is the same LAN host on plain HTTP port `5174`
because the local client dev server usually does not run TLS. Override it with
`ICAROS_EXPERIENCE_ORIGIN`, `ICAROS_EXPERIENCE_PROTOCOL`, or
`ICAROS_EXPERIENCE_PORT` when the client runs elsewhere or really serves HTTPS.

The Quest launch URL itself is always the Host endpoint
`http(s)://<host-lan-ip>:5183/launch`. The experience client URL is separate,
commonly `http(s)://<host-lan-ip>:5174/`, and must never be shown with a
`/launch` path.

The operator sets the active id in the console. The host forwards
`control.orientation` only to registered experience clients whose
`experienceId` matches `activeExperienceId`.

## TODO

- Create local HTTPS certificates for the Mac LAN address with `mkcert` and
  store them at `.certs/icaros-host.pem` and
  `.certs/icaros-host-key.pem`.
- Install the mkcert root CA on the Meta Quest so the headset trusts
  `https://<mac-lan-ip>:5183/launch` and the redirected experience origin.
- Restart the host with `PORT=5183 bun run serve:lan` and confirm it listens on
  `https://0.0.0.0:5183` when certificates are present.
- Start the standalone experience client on port `5174` and keep
  `/ws/runtime` proxied back to the host.
- Set `activeExperienceId` in the host console from one stable LAN origin.
- Verify that `https://<mac-lan-ip>:5183/launch` returns a `307` redirect to
  `http://<mac-lan-ip>:5174/` by default when the client dev server is plain
  HTTP.
- If the standalone client runs with TLS, set
  `ICAROS_EXPERIENCE_PROTOCOL=https` or `ICAROS_EXPERIENCE_ORIGIN` and verify
  that `/launch` redirects to `https://<mac-lan-ip>:5174/`.
- Open the launch URL on the Quest and confirm the WebXR experience connects to
  `/ws/runtime` with WSS.
- Add or keep automated coverage for default launch URL resolution, missing
  active experience handling, and configured experience origin/path overrides.

## Runtime Flow

1. Host starts.
2. Operator opens `/`.
3. Console shows station state and runtime connection URLs.
4. Operator sets `activeExperienceId`.
5. The Meta Quest opens `/launch` and is redirected to the active WebXR client.
6. M5 connects to `/ws/device`.
7. Runtime clients connect to `/ws/runtime` and register their role/id.
8. Host forwards `station.state` to runtime clients.
9. Host forwards `control.orientation` only to the active registered experience.
10. Stale or disconnected M5 state produces neutral safe-mode controls.

## Acceptance Criteria

- One page shows station status and runtime connection URLs.
- `/launch` redirects to the configured active experience URL.
- Meta Quest can reach the host or active WebXR experience over HTTPS.
- HTTPS runtime clients use WSS for `/ws/runtime`.
- Operator can set and clear `activeExperienceId`.
- A simulated M5 can drive normalized control data.
- Active registered experience receives `control.orientation`.
- Stale/disconnected M5 state produces safe neutral controls.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
