# Experience Client Prompt

Purpose: copyable implementation prompt for generating an external
Three.js/WebXR experience client. The canonical runtime contract is
[client-api.md](client-api.md); Quest, HTTPS, and launch operations are described
in [quest-https-launch-routing.md](quest-https-launch-routing.md).

Bitte baue eine externe Three.js/WebXR Experience für Icaros Host.

## Wichtigste Aufgabe

Der Client stellt eine eigene HTTPS-Seite für den Icaros Flugsimulator zur
Verfügung. Diese Seite zeigt die Experience, die später vom Host auf die
3D-Brille geroutet wird.

Das Launch-Denkmodell ist: `Client -> Host -> Brille`. Der Client stellt die
Experience bereit und meldet seine HTTPS-URL beim Host. Der Host macht diese
registrierte Experience anschließend für die Brille verfügbar.

Die Steuerung läuft über WebSocket. Der Client muss sich mit dieser
Schnittstelle verbinden:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

Der Host sendet dort `control.orientation`. Das sind die Werte, die der Client
bekommt:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	controllerType: 'm5';
}>;
```

`pitch` ist die Vorwärts- und Rückwärtsneigung. `roll` ist die seitliche
Neigung. Beide Werte sind bereits bereinigt, geglättet und normalisiert. Sie
liegen im Bereich `-1..1`. `quality` liegt im Bereich `0..1` und zeigt, ob die
Steuerdaten zuverlässig sind.

## Beispielwerte

- `experienceId`: `mountain-flight`
- Titel: `Mountain Flight`
- Host-Origin: `https://<host-lan-ip-or-name>:5183`
- Client-URL: `https://<client-lan-ip-or-name>:5174/`
- Control-Socket: `wss://<host-lan-ip-or-name>:5183/ws/control/main`
- Optionaler Runtime-Socket: `wss://<host-lan-ip-or-name>:5183/ws/runtime`
- Quest-Einstieg: `https://<host-lan-ip-or-name>:5183/launch`

Für lokale Desktop-Entwicklung darf der Client auf `https://localhost:5174/`
laufen. Für Quest- oder LAN-Tests muss die in `client.hello` registrierte
Client-URL aber vom Headset erreichbar sein, zum Beispiel
`https://<client-lan-ip-or-name>:5174/`. `localhost` zeigt aus Sicht der Quest
auf die Quest selbst, nicht auf den Entwicklungsrechner.

## Was der Client bauen muss

Der Client muss eine HTTPS-Seite bereitstellen, zum Beispiel:

```txt
https://<client-lan-ip-or-name>:5174/
```

Diese Seite zeigt die Experience, die später auf die 3D-Brille geroutet wird.
Der Client registriert seine erreichbare HTTPS-URL beim Host. Der Host kann
diese registrierte Experience dann für die Brille als Launch-Ziel anbieten.

Der Client muss beim Start den Control-Socket öffnen:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

Der Client soll eingehende Nachrichten validieren und nur
`control.orientation` für die Steuerung verwenden. Wenn `quality` den Wert `0`
hat, soll die Experience die Bewegung neutral halten, ausblenden oder sicher
stoppen.

Wichtig: Der Host bereinigt, glättet und schützt die Steuerdaten bereits
serverseitig. Die Safety-Logik liegt in
[safety.ts](../src/lib/server/control/safety.ts). Der Client soll diese Logik
nicht doppelt nachbauen, sondern die ausgegebenen `pitch`-, `roll`- und
`quality`-Werte verwenden.

## Optionale Launch-Registrierung

Wenn der Client in der Host-Konsole auswählbar sein soll, muss er sich zusätzlich
über diesen WebSocket registrieren:

```txt
wss://<host-lan-ip-or-name>:5183/ws/runtime
```

Direkt nach dem Öffnen sendet der Client `client.hello`:

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

Danach sendet der Client alle 3 bis 5 Sekunden `client.heartbeat`:

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

`clientId` identifiziert die konkrete Browser- oder Headset-Instanz.
`experienceId` ist der stabile Name der Experience. `url` muss die HTTPS-URL der
Client-Seite sein. HTTP-URLs werden vom Host abgelehnt.

## Launch-Regeln

Die Brille nutzt diese feste Host-URL als Einstieg:

```txt
https://<host-lan-ip-or-name>:5183/launch
```

Der Host nimmt den aktuell ausgewählten, online registrierten Client und macht
dessen Experience für die Brille erreichbar. `/launch` gehört immer zum Host
und niemals zum Client-Port.

Wenn kein Client ausgewählt ist, der Client offline ist oder keine HTTPS-URL
registriert hat, soll `/launch` klar scheitern. Baue keinen eigenen Fallback im
Client.

## Wichtige Grenzen

- Der Client verbindet sich nicht direkt mit dem M5-Gerät.
- Der Client öffnet nicht `/ws/device`.
- Der Client ruft nicht `/api/m5-pairing` auf.
- Der Client wertet keine rohen M5-Daten aus.
- Der Client baut keine eigene Normalisierung für `pitch` oder `roll`.
- Browser-, Quest- und WebXR-Verbindungen nutzen HTTPS und WSS.
- Nur die M5-Geräteverbindung des Hosts darf plain `ws://` verwenden.

## Code-Erwartung

Baue nur, was der Client braucht: HTTPS-Seite, WebXR/Three.js-Experience,
Control-WebSocket und optional die Runtime-Registrierung.

Halte Host-Origin, Experience-ID, Titel und Client-URL leicht anpassbar. Räume
WebSockets, Intervalle und Renderloops mit `dispose()` sauber auf.
