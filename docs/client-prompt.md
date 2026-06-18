# Experience Client Prompt

Purpose: short prompt for generating an external Three.js/WebXR client. The
canonical runtime contract is [client-api.md](client-api.md).

Bitte baue eine externe Three.js/WebXR Experience fuer Icaros Host.

## Kontext

- Der Host laeuft getrennt von dieser Experience.
- Die Experience rendert die Szene selbst.
- Steuerdaten kommen von `wss://<host>/ws/control/main`.
- Launch-Registrierung ueber `wss://<host>/ws/runtime` ist optional.
- Keine eigene M5-, Pairing-, Hardware- oder `/api/m5-pairing`-Logik.
- HTTPS fuer Quest/WebXR, WSS fuer Host-Sockets.

## Beispielwerte

- `experienceId`: `mountain-flight`
- Titel: `Mountain Flight`
- Host-Origin: `https://<host-lan-ip-or-name>:5183`
- Client-URL: `https://<client-lan-ip-or-name>:5174/`

## Erwartung

- Kleine Module fuer Rendering, Control-Stream, optionale Registration und
  Steuerungszustand.
- Klare Lifecycle-Funktionen wie `start()` und `dispose()`.
- Eingehende WebSocket-Nachrichten validieren.
- Nur `control.orientation.pitch`, `roll` und `quality` anwenden.
- Bei `quality: 0` Bewegung neutral halten oder stoppen.
- Sockets, Intervalle, Listener und Renderloops sauber aufraeumen.
