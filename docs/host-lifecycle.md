# Eine Reise durch den Icaros Host

Dieses Dokument erklärt den Icaros Host aus Sicht einer Person, die eine
Experience anschließen, den Server starten oder die Codebasis lesen will.

Der Host sitzt direkt am Icaros. Er routet VR-Experiences und stellt
Controller-Daten über eine einfache Schnittstelle bereit.

Die Experience-Clients stellen eine HTTPS-Website mit der 3D-Experience bereit.
Der Host routet die Brille zu einem ausgewählten Client. Die Clients bekommen
nur diese Controller-Daten:

```txt
M5-Rohdaten -> Host -> control.orientation -> Experience
```

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	controllerType: 'm5';
}>;
```

Wie die Brille gestartet wird, wie der M5 verbunden ist und wie Sensordaten
gelesen werden, bleibt Aufgabe des Hosts.

`pitch` und `roll` liegen in `-1..1`. `quality` liegt in `0..1`. Wenn keine
frischen oder plausiblen Controller-Daten da sind, sendet der Host neutrale Werte:
`pitch: 0`, `roll: 0`, `quality: 0`.

## 1. Das Bild

Die Brille öffnet eine feste Host-URL. Der Host entscheidet, welcher registrierte
Client gestartet wird. Die Controller-Daten laufen unabhängig davon als
öffentlicher Stream zu den Clients.

![Skizze der Host-Runtime-Routing-Architektur](assets/host-runtime-routing-sketch.png)

Die wichtigsten Wege:

| Pfad | Bedeutung |
| --- | --- |
| `/` | Operator-Konsole |
| `/launch` | feste URL für die Brille; leitet zum ausgewählten Client weiter |
| `/ws/runtime` | Clients registrieren sich für die Launch-Auswahl |
| `/ws/control/main` | Clients empfangen `control.orientation` |
| `/ws/device` | M5 sendet Rohdaten an den Host |

## 2. Die Rollen

Der Host hat drei Hauptaufgaben:

1. M5-Daten annehmen und normalisieren.
2. Einen konkreten Runtime Client für `/launch` auswählen.
3. Den Experiences eine kleine stabile Steuer-Schnittstelle geben.

Ein Runtime Client ist ein Browser- oder WebXR-Client, der sich beim Host als
Launch-Ziel registriert. Eine Experience ist die VR-Anwendung, die auf diesem
Client läuft.

Die wichtigsten Begriffe:

| Begriff | Bedeutung |
| --- | --- |
| `clientId` | konkrete Browser- oder Headset-Instanz |
| `experienceId` | stabile Kennung der Experience |
| `selectedLaunchClientId` | der Client, zu dem `/launch` weiterleitet |
| `selectedExperienceId` | abgeleitete Anzeige- und Kompatibilitätsinformation |
| `control.orientation` | öffentliche Steuer-Nachricht für Experiences |

## 3. Serverstart

Der normale Start ist:

```sh
bun start
```

Der Start prüft TLS, baut die SvelteKit-App und startet den Server.

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [scripts/start-host.ts](../scripts/start-host.ts) | Startlogik: TLS prüfen, Ports wählen, Build starten |
| [server/index.ts](../server/index.ts) | HTTPS-Server starten und WebSocket-Gateway anhängen |
| [src/lib/server/startup](../src/lib/server/startup) | Start-Konfiguration und TLS-Prüfung |

Browser, Brille und Experience-Clients nutzen HTTPS/WSS. Der M5 nutzt einen
separaten unverschlüsselten Geräte-WebSocket, weil die Firmware das so
erwartet.

Typische URLs:

```txt
https://<host-lan-ip-or-name>:5183/
ws://<host-lan-ip-or-name>:5184/ws/device
```

## 4. WebSocket-Gateway

Das Gateway nimmt die WebSocket-Verbindungen an und sortiert sie nach Pfad.

Wichtige Datei:

```txt
src/lib/server/ws/gateway.ts
```

Was dort passiert:

- `/ws/device` nimmt M5-Rohdaten an.
- `/ws/runtime` nimmt Runtime Clients an.
- `/ws/control/main` verteilt normalisierte Controller-Daten.
- alte M5-Daten werden erkannt und in neutrale Controls übersetzt.
- Runtime Clients ohne Heartbeat werden als `stale` markiert.

Das Gateway besitzt Sockets und Timer. Deshalb hat es eine klare
`dispose()`-Funktion für das Aufräumen beim Serverende.

## 5. Operator-Konsole

Die Konsole ist die einzige UI-Seite des Hosts:

```txt
/
```

Sie zeigt:

- Verbindungsadressen
- Runtime Clients
- aktuelle Launch-Auswahl
- M5-Setup und Pairing
- Live-Daten aus `/ws/control/main`

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [src/routes/+page.svelte](../src/routes/+page.svelte) | setzt die Konsolenbereiche zusammen |
| [src/routes/+page.server.ts](../src/routes/+page.server.ts) | dünner Einstieg für `load` und `actions` |
| [src/routes/_console](../src/routes/_console) | route-lokale UI- und Browser-State-Dateien |

Die Konsole ist absichtlich route-lokal. Sie ist keine allgemeine
Komponentenbibliothek, sondern die konkrete Bedienoberfläche für diese Station.

## 6. Launch-Auswahl

`/launch` startet keine Experience selbst. `/launch` leitet zur HTTPS-URL des
ausgewählten Runtime Clients weiter.

Schlüsselvariable:

```ts
selectedLaunchClientId: string | null
```

Der Host leitet nur weiter, wenn:

- ein Client ausgewählt ist
- dieser Client online ist
- seine registrierte URL HTTPS nutzt

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [src/lib/server/station/state.ts](../src/lib/server/station/state.ts) | speichert `selectedLaunchClientId` und `selectedExperienceId` |
| [src/lib/server/launch/launch-routing.ts](../src/lib/server/launch/launch-routing.ts) | prüft das Launch-Ziel |
| [src/routes/launch/+server.ts](../src/routes/launch/+server.ts) | antwortet mit `307` oder Fehler |

Das ist wichtig für die Brille: Sie muss nur die feste Host-URL kennen. Der
Host entscheidet den aktuellen Ziel-Client.

## 7. Runtime Clients

Eine Experience registriert sich optional über:

```txt
wss://<host-lan-ip-or-name>:5183/ws/runtime
```

Sie sendet `client.hello` mit:

| Feld | Bedeutung |
| --- | --- |
| `clientId` | konkrete Browser-/Headset-Instanz |
| `experienceId` | stabile Experience-Kennung |
| `title` | Anzeige in der Konsole |
| `url` | HTTPS-URL, an die `/launch` weiterleiten darf |
| `userAgent` | optionale Diagnoseinformation |

Danach sendet der Client regelmäßig `client.heartbeat`. Wenn Heartbeats
ausbleiben, wird der Client `stale` und ist nicht mehr als Launch-Ziel
auswählbar.

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [src/lib/protocol](../src/lib/protocol) | Nachrichtentypen und Validierung |
| [src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts) | Registry der Runtime Clients |

## 8. Controller-Daten

Der M5 sendet Rohdaten an:

```txt
ws://<host-lan-ip-or-name>:5184/ws/device?pairing=...
```

Die Experience sieht diese Rohdaten nie. Sie bekommt nur:

```txt
control.orientation
```

Wichtige Datei:

```txt
src/lib/server/control/normalizer.ts
```

Der Normalizer:

- liest bekannte M5-Felder wie `pitch`, `roll`, `angleX`, `angleY`
- wandelt Winkel in `-1..1` um
- begrenzt `quality` auf `0..1`
- glättet gültige Bewegungen
- erzeugt neutrale Werte, wenn Daten fehlen oder veraltet sind

Zusätzlich prüft [src/lib/server/control/safety.ts](../src/lib/server/control/safety.ts),
ob ein wiederkehrender Controller in einer extremen Lage startet oder plötzlich
einen großen Sprung macht. Solche Frames werden im Host neutralisiert. Damit
soll verhindert werden, dass Nutzerinnen und Nutzer bei einem Ausfall schwindelig
werden oder in einer extremen Position hängen bleiben.

Das hält Experience-Code klein: Die Experience muss nur `pitch`, `roll` und
`quality` anwenden. `quality: 0` bedeutet: neutral halten oder Bewegung stoppen.

## 9. Control Stream

Der öffentliche Steuerdaten-Stream ist:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

Clients abonnieren diesen Stream, wenn sie Controller-Daten brauchen. Das ist
getrennt von der Launch-Registrierung.

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [src/lib/server/control/control-stream-config.ts](../src/lib/server/control/control-stream-config.ts) | definiert den Stream `main` |
| [src/lib/server/ws/control-stream-clients.ts](../src/lib/server/ws/control-stream-clients.ts) | verwaltet Stream-Abonnenten |

Aktuell gibt es nur `main`. Mehrere Streams sind erst ein späteres Thema.

## 10. M5-Setup

USB ist für Setup und Diagnose. Der Betrieb läuft danach über WLAN/LAN und
`/ws/device`.

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts) | gemeinsame Logik für Konsole und CLI |
| [src/lib/server/device/usb-setup.ts](../src/lib/server/device/usb-setup.ts) | USB-/WLAN-Setup-Status |
| [src/lib/server/device/pairing.ts](../src/lib/server/device/pairing.ts) | Pairing-Token und Geräte-URL |
| [scripts/connect-m5-usb.py](../scripts/connect-m5-usb.py) | serieller USB-Adapter |

Lokale Dateien:

```txt
.icaros/secrets/m5-device-pairing-token
.icaros/m5-controller.toml
```

Der Pairing-Token gehört nur zur M5-Grenze. Browser- und WebXR-Clients nutzen
ihn nicht.

## 11. Client-Bibliothek

Experiences können die kleinen Browser-Helfer aus `src/lib/client` nutzen.

Wichtige Funktionen:

| Funktion | Aufgabe |
| --- | --- |
| `createIcarosControlStreamClient()` | abonniert `/ws/control/main` |
| `createIcarosLaunchRegistrationClient()` | registriert den Client auf `/ws/runtime` |
| `createIcarosExperienceClient()` | kombiniert beide Wege |

Der typische Lifecycle ist:

```ts
client.start();
client.dispose();
```

`dispose()` ist wichtig, weil Browser-Sockets, Heartbeats und Listener sonst
weiterlaufen können.

Der vollständige Client-Vertrag steht in [docs/client-api.md](client-api.md).

## 12. Diagnose

Menschen nutzen die Konsole. Automation und Coding-Agenten nutzen die CLI:

```sh
bun run m5:pairing -- health
bun run m5:pairing -- protocols
bun run m5:pairing -- snapshot
bun run m5:pairing -- checklist
```

Wichtige Dateien:

| Datei | Aufgabe |
| --- | --- |
| [scripts/m5-pairing-cli.ts](../scripts/m5-pairing-cli.ts) | CLI für M5-Diagnose |
| [src/routes/api/m5-pairing/+server.ts](../src/routes/api/m5-pairing/+server.ts) | JSON-Diagnose-Route |
| [scripts/smoke-runtime.ts](../scripts/smoke-runtime.ts) | Runtime-Smoke-Test |

Konsole und CLI nutzen denselben Host-Core. Die CLI hat keine eigene
Pairing-Logik.

## 13. Safety und neutrale Controls

Safety ist serverseitig gelöst. Die Clients bekommen keinen eigenen
`safeMode`-Schalter.

Der Host sendet neutrale Controls, wenn:

- kein M5 verbunden ist
- ein Frame ungültig ist
- ein Frame veraltet ist
- die M5-Verbindung geschlossen wurde
- ein Controller nach einer Pause in extremer Lage zurückkommt
- ein Controller plötzlich einen zu großen Sprung macht

Für die Experience heißt das: Bei `quality: 0` Bewegung stoppen oder neutral
halten.

## 14. Was der Host nicht macht

Der Host macht bewusst nicht:

- VR-Welten rendern
- Experience-Builds ausliefern
- Websites über WebSocket streamen
- Experiences direkt mit dem M5 verbinden
- M5-Rohdaten in Three.js-Levels auswerten
- HTTP-Launch-Fallbacks nutzen
- eine zweite Pairing-Logik in der CLI pflegen

Diese Grenzen halten den Host klein. Neue Experiences können entstehen, ohne
dass der Host ihre 3D-Welt kennen muss.

## 15. Lesepfade

| Frage | Einstieg |
| --- | --- |
| Wie startet der Host? | [scripts/start-host.ts](../scripts/start-host.ts), [server/index.ts](../server/index.ts) |
| Welche Nachrichten gibt es? | [src/lib/protocol/types.ts](../src/lib/protocol/types.ts), [src/lib/protocol/messages.ts](../src/lib/protocol/messages.ts) |
| Wo werden externe Nutzdaten validiert? | [src/lib/protocol/validators.ts](../src/lib/protocol/validators.ts) |
| Wo hängen die WebSocket-Pfade? | [src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts) |
| Wie funktioniert `/launch`? | [src/lib/server/launch/launch-routing.ts](../src/lib/server/launch/launch-routing.ts), [src/routes/launch/+server.ts](../src/routes/launch/+server.ts) |
| Wo sitzt die Konsole? | [src/routes/+page.svelte](../src/routes/+page.svelte), [src/routes/_console](../src/routes/_console) |
| Wo wird normalisiert? | [src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts) |
| Wie bauen Experiences den Client? | [src/lib/client](../src/lib/client), [docs/client-api.md](client-api.md) |
| Wie debugge ich M5? | [docs/debugging.md](debugging.md), [docs/m5-pairing-solution.md](m5-pairing-solution.md) |
| Wie debugge ich Quest/HTTPS? | [docs/quest-https-launch-routing.md](quest-https-launch-routing.md) |

## 16. Der Ablauf in kurz

1. Host starten.
2. Operator-Konsole öffnen.
3. Experience-Client über HTTPS starten.
4. Client registriert sich optional auf `/ws/runtime`.
5. Operator wählt den Launch-Client.
6. Brille öffnet `/launch`.
7. Host leitet zur Client-URL weiter.
8. M5 sendet Rohdaten an `/ws/device`.
9. Host sendet `control.orientation` auf `/ws/control/main`.
10. Experience nutzt `pitch`, `roll` und `quality`.
