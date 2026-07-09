# Icaros Host Code Tour

Purpose: Schritt-für-Schritt-Erklärung des aktuellen Host-Lebenszyklus für
Menschen, die den Host betreiben, verstehen oder kleine Anpassungen vornehmen
möchten. Dieses Dokument ist eine Code-Tour, keine vollständige API-Referenz.

## Das Wichtigste Zuerst

Der Icaros Host ist die technische Station zwischen M5-Controller,
Operator-Konsole, Headset und externen VR Experiences. Er rendert keine
VR-Welt. Er startet auch keine Experience. Er sorgt dafür, dass Controller,
Launch-Auswahl und sichere Verbindungen geordnet zusammenarbeiten.

Der Kernablauf ist:

```txt
M5 raw frame -> Host normalizer -> control.orientation -> Experience
                     ^
                     |
       Operator selects launch client on /
```

Die wichtigsten Regeln:

- Der M5 sendet rohe Controller-Frames nur an den Host.
- Experiences lesen nur normalisierte Werte aus `/ws/control/main`.
- Runtime Clients registrieren sich optional über `/ws/runtime`, damit sie in
  der Launch-Auswahl erscheinen.
- Die Konsole auf `/` wählt einen konkreten online Runtime Client für
  `/launch`.
- `/launch` leitet per `307` auf die HTTPS-URL dieses ausgewählten Clients.
- Browser, Headset und Experience Clients verwenden HTTPS/WSS.
- Plain `ws://` ist nur für den M5-Geräteport vorgesehen.

Die Datei wurde aus der früher ausführlicheren Historie von
`docs/host-lifecycle.md` wieder aufgebaut und auf die aktuelle Cleanup-Struktur
aktualisiert. Besonders wichtig: Die aktuelle Auswahl heißt
`selectedLaunchClientId`, nicht mehr `activeClientId`.

## Schnellkarte Der Wichtigsten Dateien

| Bereich | Einstieg | Wofür du die Datei liest |
| --- | --- | --- |
| Produktionsstart | [server/index.ts](../server/index.ts) | HTTPS-Server, SvelteKit-Handler, WebSocket-Gateway, M5-Device-Port |
| Operator-Konsole | [src/routes/+page.server.ts](../src/routes/+page.server.ts) | Route-Einstieg für `load` und Form Actions |
| Konsolenlogik | [src/routes/_console/server/page-server.ts](../src/routes/_console/server/page-server.ts) | Daten für `/` und Bedienaktionen wie Client-Auswahl oder M5-Setup |
| Konsolen-UI | [src/routes/+page.svelte](../src/routes/+page.svelte), [src/routes/_console/components](../src/routes/_console/components) | Sichtbare Panels für URLs, Controller, Runtime Clients und Control Stream |
| WebSocket-Gateway | [src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts) | Upgrade-Routing für `/ws/device`, `/ws/runtime`, `/ws/control/main` |
| Runtime Clients | [src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts) | Registrierte Browser/Headset-Instanzen, Heartbeats, stale Status |
| Control Subscriber | [src/lib/server/ws/control-stream-clients.ts](../src/lib/server/ws/control-stream-clients.ts) | Öffentliche Abonnenten normalisierter Steuerdaten |
| Launch Routing | [src/lib/server/launch/launch-routing.ts](../src/lib/server/launch/launch-routing.ts) | Auswahl prüfen, HTTPS-Ziel für `/launch` auflösen |
| Station State | [src/lib/server/station/state.ts](../src/lib/server/station/state.ts) | `selectedLaunchClientId` und abgeleitete `selectedExperienceId` |
| M5 Pairing | [src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts) | Gemeinsame Pairing-Orchestrierung für Konsole und CLI |
| M5 Token/URL | [src/lib/server/device/pairing.ts](../src/lib/server/device/pairing.ts) | Pairing-Token, Device-URL, Trennung von WSS und plain WS |
| M5 Setup State | [src/lib/server/device/usb-setup.ts](../src/lib/server/device/usb-setup.ts) | USB-Workflow, gespeicherte Controller-Konfiguration, Discovery |
| Normalisierung | [src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts) | M5-Frames parsen, in `pitch`/`roll`/`quality` umrechnen |
| Safety | [src/lib/server/control/safety.ts](../src/lib/server/control/safety.ts) | Abrupte Sprünge und unsichere Reconnects neutralisieren |
| Public Protocol | [src/lib/protocol](../src/lib/protocol) | Nachrichtentypen, Envelope, Validatoren |
| Browser Helper | [src/lib/client](../src/lib/client) | Hilfen für externe Experience Clients |
| Diagnose-API | [src/routes/api/m5-pairing/+server.ts](../src/routes/api/m5-pairing/+server.ts) | JSON-Adapter für CLI und Automation |
| Diagnose-CLI | [scripts/m5-pairing-cli.ts](../scripts/m5-pairing-cli.ts) | Wiederholbare M5-Checks ohne UI |

## Die Zentrale Datenform

Experience-Code soll keine M5-Rohdaten kennen. Er bekommt nur diese kleine,
stabile Steuerform:

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

`pitch` und `roll` liegen im Bereich `-1..1`. `quality` liegt im Bereich
`0..1`. Wenn Werte fehlen, veraltet sind oder unsicher wirken, sendet der Host:

```ts
{
	pitch: 0,
	roll: 0,
	quality: 0,
	buttonPressed: false,
	buttonDown: false,
	buttonUp: false,
	controllerType: 'm5'
}
```

Das ist kein Fehlerformat, sondern der normale neutrale Zustand. Eine
Experience sollte `quality: 0` so behandeln, als wäre keine verlässliche
Steuerung vorhanden.

## 1. Start: Der Host Baut Seine Technische Basis

Der Produktionsstart beginnt in [server/index.ts](../server/index.ts). Diese
Datei ist bewusst nur Start-Orchestrierung. Fachlogik wie Pairing, Launch oder
Normalisierung bleibt in `src/lib/server`.

Wichtige Funktionen:

- `start()` ist der Hauptablauf.
- `ensureBuildHandler()` prüft, ob `build/handler.js` existiert.
- `loadTlsOptions()` liest `.certs/icaros-host-key.pem` und
  `.certs/icaros-host.pem`.
- `createProtocolAwareHandler()` reicht Requests an den SvelteKit-Handler
  weiter und setzt den erwarteten HTTPS-Proto-Header.
- `createIcarosWebSocketGateway()` erzeugt das Gateway für die drei
  WebSocket-Grenzen.
- `resolvePlainDeviceWsPort()` entscheidet, ob ein separater plain M5-Port
  geöffnet wird.
- `createPlainDeviceServer()` startet einen HTTP-Server, der nur
  `/ws/device`-Upgrades für den M5 erlaubt.
- `waitForShutdown()` räumt bei `SIGINT` oder `SIGTERM` Sockets und Server auf.

Der normale Start ist:

```sh
bun run build
bun start
```

`bun run build` erzeugt den SvelteKit-Node-Build. `bun start` importiert dann
`build/handler.js`, startet einen eigenen Node-HTTPS-Server und hängt das
WebSocket-Gateway an diesen Server. Das passt zum SvelteKit-Node-Adapter:
SvelteKit erzeugt einen Handler, der in einem eigenen Server verwendet werden
kann.

Typische Ausgaben:

```txt
https://localhost:5183/
https://<host-lan-ip-or-name>:5183/
ws://<host-lan-ip-or-name>:5184/ws/device
```

Hintergrund: WebXR und viele Browserfunktionen brauchen sichere Kontexte. Auf
dem Headset bedeutet das praktisch HTTPS für Seiten und WSS für
Browser-WebSockets. Der M5 ist dagegen ein kleines Firmware-Gerät und spricht
plain WebSocket. Deshalb trennt der Host bewusst HTTPS/WSS für Browser von
`ws://...:5184/ws/device` für den Controller.

## 2. Die Operator-Konsole Auf `/`

Die Konsole ist die einzige technische UI-Seite des Hosts. Sie zeigt:

- erreichbare Host-, Launch-, Runtime- und M5-Adressen
- M5-Setup- und Firmware-Status
- registrierte Runtime Clients
- den aktuell ausgewählten Launch Client
- Live-Control-Daten für Diagnose

Der route-öffentliche Einstieg ist sehr dünn:

- [src/routes/+page.server.ts](../src/routes/+page.server.ts) exportiert
  `load` und `actions` aus dem route-lokalen Konsolenmodul.
- [src/routes/+page.svelte](../src/routes/+page.svelte) setzt die sichtbaren
  Panels zusammen.

Die eigentliche serverseitige Konsolenlogik liegt in
[src/routes/_console/server/page-server.ts](../src/routes/_console/server/page-server.ts).

Wichtige Funktionen und Actions:

- `load()` liest `readLaunchRoutingState()`, `resolveConnectionInfo()` und
  `getM5PairingStatus()` und baut daraus den Zustand für die Seite.
- `setSelectedLaunchClient` ruft `selectLaunchClient(...)` auf.
- `connectUsb`, `probeUsbController`, `flashM5Firmware`, `abortUsbWorkflow` und
  `setPairingDebug` leiten M5-Aktionen an `runM5PairingCommand(...)` weiter.

Die sichtbaren Komponenten liegen unter
[src/routes/_console/components](../src/routes/_console/components). Die Namen
sind absichtlich sprechend, zum Beispiel:

- `connection-addresses-panel.svelte`
- `controller-setup-panel.svelte`
- `runtime-clients-panel.svelte`
- `launch-selection-panel.svelte`
- `control-stream-panel.svelte`

Warum nur eine Seite? Für Stationsbetrieb ist das einfacher: Eine Person soll
auf einen Blick sehen, was verbunden ist, welcher Client gestartet wird und ob
der Controller sicher wirkt. Mehrere UI-Unterseiten würden hier kaum helfen
und die Fehlersuche eher schwerer machen.

## 3. Station State: Was Der Host Sich Merkt

Der Host hat keinen großen globalen Zustand. Der zentrale Stationszustand lebt
in [src/lib/server/station/state.ts](../src/lib/server/station/state.ts).

Die relevante Form ist:

```ts
type StationState = Readonly<{
	selectedExperienceId: string | null;
	selectedLaunchClientId: string | null;
}>;
```

`selectedLaunchClientId` ist die wichtige Wahrheit. Sie bezeichnet eine
konkrete Browser- oder Headset-Instanz. `selectedExperienceId` ist daraus
abgeleitet und bleibt für Anzeige und Kompatibilität erhalten.

Warum konkrete Clients statt nur Experience-Namen? Dieselbe Experience kann
mehrfach offen sein: im Desktop-Browser, im Headset, in einem Testfenster. Für
`/launch` muss der Host genau wissen, welche Instanz gestartet werden soll.

Die einzige Schreibfunktion für diese Auswahl ist:

- `setLaunchClientSelection(...)` in
  [src/lib/server/station/launch-selection.ts](../src/lib/server/station/launch-selection.ts)

Die Konsole ruft diese Funktion nicht direkt auf, sondern geht über
`selectLaunchClient(...)` in der Launch-Schicht. Dadurch wird vorher geprüft,
ob der Client online und auswählbar ist.

## 4. Runtime Clients: Experiences Melden Sich An

Eine VR Experience läuft als eigenes Projekt und eigene HTTPS-Seite. Wenn sie
in der Host-Konsole erscheinen soll, verbindet sie sich mit:

```txt
wss://<host-lan-ip-or-name>:5183/ws/runtime
```

Dort sendet sie `client.hello` mit:

- `clientId`: konkrete Browser/Headset-Instanz
- `experienceId`: stabile Experience-Kennung
- `title`: Anzeigename
- `url`: HTTPS-URL, auf die `/launch` später weiterleiten darf
- `userAgent`: optionaler Diagnosehinweis

Danach sendet sie regelmäßig `client.heartbeat`. Der Browser-Helfer dafür
liegt in
[src/lib/client/launch-registration-client.ts](../src/lib/client/launch-registration-client.ts).
Die wichtigsten Funktionen sind:

- `createIcarosLaunchRegistrationClient(...)`
- `start()`
- `dispose()`
- `onStationState(...)`

Auf Host-Seite nimmt
[src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts) die Verbindung
an. Die Registry selbst liegt in
[src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts).

Wichtige Methoden:

- `add(socket)` legt eine unregistrierte Runtime-Verbindung an.
- `registerHello(client, payload, now)` speichert die konkrete Instanz.
- `recordHeartbeat(clientId, now)` hält den Client frisch.
- `markStaleClients(now, staleAfterMs)` markiert nicht antwortende Clients als
  `stale`.
- `findSelectableClient(clientId)` erlaubt nur online Clients für die
  Launch-Auswahl.
- `listRuntimeClients()` liefert die sortierte Liste für die Konsole.

Hintergrund: `stale` bedeutet nicht zwingend "kaputt". Es heißt nur: Der Host
hat länger keinen Heartbeat gesehen und verwendet diesen Client deshalb nicht
mehr als verlässliches Launch-Ziel.

## 5. `/launch`: Das Headset Öffnet Immer Den Host

Das Headset soll nicht jedes Mal eine andere Experience-URL kennen müssen. Es
öffnet immer:

```txt
https://<host-lan-ip-or-name>:5183/launch
```

Die Route liegt in [src/routes/launch/+server.ts](../src/routes/launch/+server.ts).
Sie ist absichtlich klein:

- `GET` ruft `resolveSelectedLaunchClientUrl()` auf.
- Bei Erfolg sendet sie `redirect(307, result.url)`.
- Bei Fehlern antwortet sie mit einer klaren HTTP-Fehlermeldung.

Die Entscheidung liegt in
[src/lib/server/launch/launch-routing.ts](../src/lib/server/launch/launch-routing.ts).

Wichtige Funktionen:

- `readLaunchRoutingState()` liest Station State plus aktuelles Launch-Ziel.
- `selectLaunchClient(clientId)` setzt oder löscht die Auswahl.
- `resolveSelectedLaunchClientUrl()` ist der Einstieg für `/launch`.
- `resolveLaunchClientUrl(...)` prüft die harten Regeln.

Die harten Regeln:

- Ohne Auswahl gibt es `409`.
- Ein stale oder offline Client ist kein Ziel.
- Die registrierte URL muss gültig sein.
- Die registrierte URL muss `https:` verwenden.
- Der Host liefert keine Experience-Assets aus.

Warum `307`? Ein Redirect hält die Rollen sauber: Der Host bleibt Router und
Station. Die Experience bleibt eigene WebXR-Seite. `307` ist ein klarer
temporärer Redirect auf das aktuell ausgewählte Ziel.

## 6. Control Stream: Die Experience Liest Normalisierte Steuerung

Der öffentliche Control Stream ist:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

Der Browser-Helfer liegt in
[src/lib/client/control-stream-client.ts](../src/lib/client/control-stream-client.ts).

Wichtige Funktionen:

- `createIcarosControlStreamClient(...)`
- `start()`
- `onOrientation(listener)`
- `dispose()`

Die Convenience-Fassade in
[src/lib/client/experience-client.ts](../src/lib/client/experience-client.ts)
kombiniert Control Stream und Runtime Registration:

- `createIcarosExperienceClient(...)`

Wichtig: Der Control Stream ist ein öffentlicher normalisierter Stream. Die
Launch-Auswahl bestimmt, wohin `/launch` weiterleitet. Sie ist keine
Geheimhaltungsschicht für Steuerdaten. Jeder korrekt verbundene
Control-Subscriber auf `/ws/control/main` bekommt die normalisierten
`control.orientation`-Nachrichten. Deshalb dürfen dort nur sichere,
abstrahierte Werte erscheinen, niemals M5-Rohdaten oder Secrets.

## 7. WebSocket-Gateway: Drei Pfade, Eine Technische Grenze

Das Gateway in [src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts)
ist eine zentrale Datei, aber mit klarer Verantwortung:

- HTTP-Upgrade-Anfragen annehmen
- Pfade unterscheiden
- Sockets registrieren
- Timer für stale Controller und stale Runtime Clients betreiben
- beim Beenden alles mit `dispose()` aufräumen

Die drei Pfade:

| Pfad | Zweck | Protokoll |
| --- | --- | --- |
| `/ws/device` | rohe M5-Firmware-Frames | plain WS am M5-Port oder Device-Origin |
| `/ws/runtime` | Runtime Registration, Heartbeat, Presence | WSS am Host |
| `/ws/control/main` | normalisierte `control.orientation` | WSS am Host |

Wichtige Gateway-Methoden:

- `attach(server)` hängt alle Browser/Runtime/Control-Upgrades an den
  HTTPS-Server.
- `attachDeviceServer(server)` hängt nur M5-Device-Upgrades an den separaten
  plain Server.
- `#handleUpgrade(...)` entscheidet anhand des Pfads.
- `#handleDeviceConnection(...)` liest M5-Frames.
- `#handleRuntimeConnection(...)` verarbeitet `client.hello` und
  `client.heartbeat`.
- `#handleControlStreamConnection(...)` registriert Control-Subscriber.
- `#publishStaleControlIfNeeded()` sendet neutrale Controls, wenn M5-Daten
  veralten.
- `#markStaleRuntimeClients()` markiert Runtime Clients ohne Heartbeat und
  löscht die Launch-Auswahl, wenn der ausgewählte Client nicht mehr online
  ist.

Für kleine Anpassungen gilt: Wenn du einen neuen WebSocket-Pfad brauchst, ist
das wahrscheinlich ein Architekturthema. Für normale Host-Erweiterungen ist
meist ein bestehender Pfad oder eine bestehende Nachricht der einfachere Weg.

## 8. M5 Pairing: USB Ist Setup, WLAN Ist Betrieb

Der M5 wird nicht direkt von Experiences gelesen. Er wird am Host eingerichtet
und verbindet sich danach mit dem Host-Geräteport.

Die gemeinsame Pairing-Orchestrierung liegt in
[src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts).
Konsole und CLI nutzen denselben Service. Das verhindert zwei voneinander
abweichende Pairing-Logiken.

Wichtige Funktionen:

- `getM5PairingStatus(url)` liefert Status, Verbindungsinfos und eine
  redaktierte Device-URL.
- `parseM5PairingCommand(value)` validiert JSON-Kommandos der Diagnose-API.
- `runM5PairingCommand(url, command)` ist der gemeinsame Dispatcher.
- `startUsbProbe()` startet eine reine USB-Prüfung.
- `startFirmwareFlash()` startet den expliziten Firmware-Flash.
- `startUsbSetup(url, input)` schreibt WLAN- und Host-Daten auf den M5.

Der eigentliche USB-Adapter ist:

- [scripts/connect-m5-usb.py](../scripts/connect-m5-usb.py)

Die CLI ist:

- [scripts/m5-pairing-cli.ts](../scripts/m5-pairing-cli.ts)

Typische Diagnosebefehle:

```sh
bun run m5:pairing -- health
bun run m5:pairing -- protocols
bun run m5:pairing -- snapshot
bun run m5:pairing -- checklist
```

Firmware-Uploads sind eine explizite Operator-Aktion. Der Host startet sie nur
über den Firmware-Update-Workflow; Probe und Pairing prüfen Firmware, schreiben
aber keine neue Firmware.

## 9. M5 Token Und Device-URL

Die Token- und URL-Grenze lebt in
[src/lib/server/device/pairing.ts](../src/lib/server/device/pairing.ts).

Wichtige Funktionen:

- `readDevicePairingToken()` liest den aktuellen Token.
- `createPairedDeviceWebSocketUrl(wsOrigin)` baut die URL, die auf den M5
  geschrieben wird.
- `resolveDeviceWebSocketOrigin(wsOrigin)` wandelt die Host-WSS-Origin in die
  M5-WS-Origin um oder nutzt `ICAROS_DEVICE_WS_ORIGIN`.
- `isDevicePairingRequest(candidate)` prüft eingehende M5-Verbindungen.
- `redactDevicePairingToken(input)` verhindert, dass UI oder Logs Secrets
  anzeigen.

Lokale Dateien:

```txt
.icaros/secrets/m5-device-pairing-token
.icaros/m5-controller.toml
```

Der Token ist getrennt von Runtime-Client-Registration. Ein Browser-Client darf
nicht wissen müssen, wie sich der M5 authentifiziert. Umgekehrt soll der M5
nicht am Runtime-Protokoll teilnehmen.

## 10. Aus Rohdaten Werden Ruhige Steuerdaten

Die Übersetzung von M5-Frames in öffentliche Steuerdaten liegt in
[src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts).

Wichtige Funktionen:

- `parseM5Frame(input)` parst JSON und verwirft unbrauchbare Frames.
- `isM5OrientationFrame(frame)` erkennt Frames mit nutzbarer Orientierung.
- `normalizeM5Frame(frame, now)` liest bekannte Feldnamen wie `pitch`, `roll`,
  `angleX`, `angleY`, `rotationX`, `rotationY`.
- `smoothControlOrientation(previous, next)` glättet valide Bewegungen.
- `createNeutralControl()` erzeugt den neutralen Zustand.

Konstanten, die du kennen solltest:

- `STALE_AFTER_MS = 1_000`
- `MAX_ANGLE_DEGREES = 45`
- `DEFAULT_SMOOTHING = 0.25`

Safety liegt getrennt in
[src/lib/server/control/safety.ts](../src/lib/server/control/safety.ts).

Wichtige Funktion:

- `protectControlOrientation(previous, next)`

Diese Funktion neutralisiert extreme Reconnects oder abrupte Sprünge. Der
Grund ist sehr praktisch: Auf dem Icaros liegt ein Mensch. Wenn der Controller
nach einer Unterbrechung mit extremen Werten zurückkommt, soll die Experience
nicht sofort hart abtauchen.

## 11. Public Protocol: Kleine Nachrichten Mit Validierung

Alle öffentlichen Runtime-Nachrichten verwenden Typen aus
[src/lib/protocol](../src/lib/protocol).

Wichtige Dateien:

- `types.ts` beschreibt `StationState`, `ControlOrientation`,
  `RuntimeClientSummary` und Payload-Typen.
- `messages.ts` erzeugt Host-Nachrichten mit konsistentem Envelope.
- `validators.ts` prüft externe Daten, bevor sie ins System gelangen.

Der Envelope enthält:

```ts
type Message<TType extends string, TPayload> = Readonly<{
	protocol: 'neural-flight.v1';
	type: TType;
	stationId: 'station-a';
	source: Readonly<{
		role: 'host' | 'operator' | 'quest' | 'experience' | 'm5';
		id: string;
	}>;
	timestamp: number;
	payload: TPayload;
}>;
```

Warum dieser Envelope? Er macht Nachrichten auch für einfache Clients
selbsterklärend: Version, Typ, Station, Quelle, Zeit und Payload stehen immer
an derselben Stelle.

## 12. Diagnose Und Automation

Die Konsole ist für Menschen. Die CLI und JSON-Route sind für wiederholbare
Checks, Scripte und Coding-Agenten.

Die JSON-Route:

- [src/routes/api/m5-pairing/+server.ts](../src/routes/api/m5-pairing/+server.ts)

Sie bietet:

- `GET`: aktueller M5-Pairing-Status
- `POST`: validiertes M5-Pairing-Kommando

Die CLI:

- [scripts/m5-pairing-cli.ts](../scripts/m5-pairing-cli.ts)

Beide Wege landen in
[src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts).
Das ist eine wichtige Architekturentscheidung: Diagnose darf helfen, aber sie
darf keine zweite Wahrheit über Token, Device-URL oder Setup-Zustand erfinden.

Für einfache Erreichbarkeit gibt es:

- [src/routes/health/+server.ts](../src/routes/health/+server.ts)

## 13. Was Du Für Kleine Anpassungen Wissen Musst

Wenn du die Startadressen oder Ports verstehen willst:

- Lies [server/index.ts](../server/index.ts).
- Lies [src/lib/server/network/connection-info.ts](../src/lib/server/network/connection-info.ts).
- Wichtige Variablen: `PORT`, `HOST`, `ICAROS_DEVICE_WS_PORT`,
  `ICAROS_DEVICE_WS_ORIGIN`, `ICAROS_TLS_KEY_FILE`,
  `ICAROS_TLS_CERT_FILE`.

Wenn du die Konsolenanzeige ändern willst:

- Beginne bei [src/routes/+page.svelte](../src/routes/+page.svelte).
- Suche das passende Panel in
  [src/routes/_console/components](../src/routes/_console/components).
- Serverdaten kommen aus
  [src/routes/_console/server/page-server.ts](../src/routes/_console/server/page-server.ts).

Wenn du Runtime Client Verhalten ändern willst:

- Host-Seite:
  [src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts)
  und [src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts).
- Browser-Seite:
  [src/lib/client/launch-registration-client.ts](../src/lib/client/launch-registration-client.ts)
  und [src/lib/client/experience-client.ts](../src/lib/client/experience-client.ts).
- Public Contract:
  [docs/client-api.md](client-api.md).

Wenn du M5-Werte anders interpretieren willst:

- Beginne bei [src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts).
- Ändere Safety nur mit Vorsicht in
  [src/lib/server/control/safety.ts](../src/lib/server/control/safety.ts).
- Ergänze Tests neben
  [src/lib/server/control/normalizer.test.ts](../src/lib/server/control/normalizer.test.ts).

Wenn du Launch-Verhalten ändern willst:

- Beginne bei [src/lib/server/launch/launch-routing.ts](../src/lib/server/launch/launch-routing.ts).
- Die Route selbst in [src/routes/launch/+server.ts](../src/routes/launch/+server.ts)
  sollte klein bleiben.
- Keine HTTP-Fallbacks und keine fest eingebauten Experience-URLs einführen.

## 14. Technischer Hintergrund Ohne Tiefes Vorwissen

SvelteKit: Das UI und die HTTP-Routen sind SvelteKit. Nach `bun run build`
liegt ein Node-Adapter-Build unter `build/`. Der Host startet nicht den
SvelteKit-Defaultserver, sondern importiert `build/handler.js` und hängt ihn
an einen eigenen HTTPS-Server. Dadurch kann derselbe Prozess auch die
WebSocket-Upgrades besitzen.

HTTPS und WSS: Browser behandeln manche APIs als "powerful features". WebXR
gehört dazu. Solche APIs sind auf echten Geräten typischerweise nur in
sicheren Kontexten verfügbar. Für Webseiten heißt das: HTTPS. Für
Browser-WebSockets heißt es: WSS.

Plain WS für den M5: Der M5 ist keine Browseroberfläche. Er ist ein
eingebettetes Gerät mit eigener Firmware. Deshalb darf er einen separaten
plain WebSocket-Port verwenden. Diese Ausnahme bleibt eng begrenzt auf
`/ws/device`.

WebSocket: Ein WebSocket ist eine dauerhafte Verbindung. Anders als ein normaler
HTTP-Request bleibt sie offen, damit der Host laufend Nachrichten senden und
empfangen kann. Das passt für Controller-Daten, Heartbeats und Live-Diagnose.

Heartbeat und stale Status: Netzwerke brechen ab, Tabs schlafen ein, Headsets
wechseln Apps. Der Host wartet deshalb nicht auf perfekte Abmeldungen. Er
markiert Clients als `stale`, wenn Heartbeats ausbleiben, und löscht eine
Launch-Auswahl, wenn der ausgewählte Client nicht mehr online ist.

Safe-Mode: Der Host sendet lieber neutrale Werte als alte oder sprunghafte
Werte. Das macht Fehler sichtbar und verhindert, dass eine Experience mit
veralteter Bewegung weitersteuert.

Weiterlesen:

- [MDN: Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- [MDN: WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
- [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [SvelteKit: adapter-node custom server](https://svelte.dev/docs/kit/adapter-node#Custom-server)
- [Node.js: HTTPS](https://nodejs.org/api/https.html)

## 15. Was Der Host Bewusst Nicht Macht

Der Host:

- rendert keine Three.js- oder WebXR-Welt
- startet keine Experience-Prozesse
- serviert keine externen Experience-Builds
- streamt keine Websites über WebSocket
- lässt Experiences nicht direkt mit dem M5 sprechen
- verteilt keine M5-Rohframes an Browser-Clients
- leitet `/launch` nicht auf HTTP weiter
- hardcodiert nicht alle Experiences in Host-Code
- dupliziert Pairing-Logik nicht in der CLI

Diese Grenzen machen kleine Anpassungen einfacher. Wenn du eine neue Experience
bauen willst, baust du sie als eigenen Client. Wenn du Controller-Daten anders
interpretieren willst, änderst du die Normalisierung im Host. Wenn du die
Station anders bedienen willst, änderst du die Konsole.

## 16. Die Ganze Reise In Kurzform

1. `bun run build` erzeugt den SvelteKit-Node-Build.
2. `bun start` startet [server/index.ts](../server/index.ts).
3. Der Host liest TLS-Dateien und importiert `build/handler.js`.
4. Der HTTPS-Server nimmt `/`, `/launch`, `/health` und API-Routen an.
5. Das Gateway hängt WebSocket-Upgrades an den HTTPS-Server.
6. Ein separater plain Device-Server stellt `/ws/device` für den M5 bereit.
7. Die Konsole auf `/` liest Station State, Runtime Clients und M5-Status.
8. Ein M5 wird per USB eingerichtet oder verbindet sich erneut über WLAN.
9. `/ws/device` akzeptiert nur den passenden Pairing-Token.
10. M5-Rohframes werden geparst, normalisiert, geglättet und abgesichert.
11. Control-Subscriber auf `/ws/control/main` erhalten `control.orientation`.
12. Runtime Clients registrieren sich optional mit `client.hello`.
13. Heartbeats halten Runtime Clients online.
14. Die Konsole setzt `selectedLaunchClientId`.
15. Das Headset öffnet `/launch`.
16. `/launch` prüft den ausgewählten online Client und leitet per `307` auf
    dessen HTTPS-URL weiter.
17. Bei stale M5-Daten oder Verbindungsverlust sendet der Host neutrale
    Controls.

So bleibt der Icaros Host klein und robust: Er ist Router, Gateway und
Translator der Station. Die wechselhaften Dinge wie Controller, Netzwerk,
Pairing, Headset-Start und Reconnects bleiben im Host. Die Experience bekommt
eine kleine, stabile Schnittstelle und kann sich auf ihre VR-Welt konzentrieren.
