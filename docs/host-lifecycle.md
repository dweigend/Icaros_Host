# Eine Reise durch den Icaros Host

Dieses Dokument führt dich einmal durch den laufenden Icaros Host: vom Start
des Servers über den M5-Controller und die Operator-Konsole bis zu den Runtime
Clients, die am Ende normalisierte Steuerdaten bekommen.

Der Host ist dabei nicht die VR Experience. Er ist die technische Station
dazwischen. Hier laufen Controller-Daten, registrierte Experience Clients,
aktive Auswahl, Launch-Routing, Diagnose und sichere Verbindungen zusammen.
Wenn du verstehen willst, warum eine Experience nur `control.orientation` sieht
und nie direkt mit dem M5 spricht, ist dieser Ablauf der rote Faden.

Das ist auch hilfreich, wenn du mit Coding-Agenten arbeitest. Du musst nicht
jede einzelne Zeile Code auswendig kennen und auch nicht jede Library-Funktion
im Detail verstehen. Aber du solltest die Konzepte kennen: Was macht der Host?
Wo lebt welche Verantwortung? Welche Datei ist der richtige Einstieg, wenn du
eine Funktion ändern oder erklären lassen willst? Genau dabei soll dir dieses
Dokument helfen.

Die zentrale Idee ist einfach: Der Host nimmt lokale, wechselhafte Teile und
macht daraus ein geordnetes System. Der M5 sendet rohe Bewegungsdaten. Eine
Experience rendert WebXR. Die Konsole entscheidet, welcher konkrete Runtime
Client aktiv ist. Der Host prüft, normalisiert, glättet und verteilt nur das,
was die aktive Experience wirklich braucht.

## 1. Der Server startet

Du beginnst beim Start des Servers. In diesem Moment baut der Host seine
technische Basis auf: Er prüft HTTPS, lädt die gebaute SvelteKit-App und hängt
das WebSocket-Gateway an. Erst wenn diese Grundlage steht, kann er Browser,
Headsets, Runtime Clients und den M5 sauber voneinander trennen.

Der zentrale Einstieg ist [server/index.ts](../server/index.ts). Diese Datei ist
bewusst kein Ort für Fachlogik. Sie startet den Prozess und verbindet die
großen Bausteine miteinander.

Im Code findest du hier vor allem:

- `start()` baut den HTTPS-Server, lädt `build/handler.js` und hängt das
  WebSocket-Gateway an.
- `loadTlsOptions()` prüft, ob die Host-Zertifikate vorhanden sind.
- `resolvePlainDeviceWsPort()` entscheidet, ob ein separater M5-Port geöffnet
  wird.
- `createPlainDeviceServer()` öffnet den reinen Gerätepfad für den Controller.

Warum ist diese Trennung wichtig? Browser- und Headset-Oberflächen brauchen
HTTPS und WSS. Der M5-Controller spricht dagegen firmware-kompatibel über einen
plain WebSocket. Der Host startet deshalb sichere Browser-Wege und einen
separaten Gerätepfad für den Controller.

Wenn alles läuft, stellt der Host typischerweise diese Adressen bereit:

```txt
https://localhost:5183/
https://<host-lan-ip-or-name>:5183/
ws://<host-lan-ip-or-name>:5184/ws/device
```

Damit ist der Host erreichbar. Aber noch ist nichts ausgewählt, kein Client ist
aktiv und der Controller muss entweder wiedergefunden oder eingerichtet werden.

## 2. Du öffnest die Operator-Konsole

Als Nächstes schaust du auf die sichtbare Oberfläche des Hosts: die
Operator-Konsole auf `/`. Hier siehst du, welche Verbindungen bekannt sind, ob
der M5 bereit ist, welche Runtime Clients online sind und welcher Client aktiv
ist.

Die Seite wird aus zwei Teilen aufgebaut:

- [src/routes/+page.server.ts](../src/routes/+page.server.ts) sammelt den
  serverseitigen Zustand und verarbeitet die Aktionen der Konsole.
- [src/routes/+page.svelte](../src/routes/+page.svelte) setzt die sichtbaren
  Konsolenbereiche zusammen.

In `load()` wird der aktuelle Blick auf die Station vorbereitet: Verbindung-URLs,
Station-Zustand, aktives Launch-Ziel und M5-Pairing-Status. Die `actions` in
derselben Datei sind die Bedienhandlungen: aktiven Client setzen, USB-Pairing
starten, Controller prüfen, Firmware flashen, Workflow abbrechen und Debug
umschalten.

Die sichtbaren Teile sind bewusst in kleine route-lokale Dateien zerlegt:

- [src/routes/console-connection-addresses.svelte](../src/routes/console-connection-addresses.svelte)
  zeigt Host-, Runtime-, Launch- und M5-Adressen.
- [src/routes/console-controller-setup.svelte](../src/routes/console-controller-setup.svelte)
  zeigt den M5-Setup-Status und die USB/Firmware-Aktionen.
- [src/routes/console-runtime-clients.svelte](../src/routes/console-runtime-clients.svelte)
  zeigt registrierte Runtime Clients und erlaubt die Auswahl des aktiven
  Clients.
- [src/routes/console-live-controller-data.svelte](../src/routes/console-live-controller-data.svelte)
  zeigt Live-Diagnose für normalisierte Controller-Daten.
- [src/routes/console-state.svelte.ts](../src/routes/console-state.svelte.ts)
  hält Browser-State, Timer und Diagnose-WebSocket zusammen.

Die Konsole bleibt absichtlich eine einzige Seite. Dadurch musst du nicht erst
zwischen mehreren UI-Routen unterscheiden. Es gibt eine Station, einen sichtbaren
Zustand und eine klare Stelle, an der entschieden wird, welcher Runtime Client
aktiv ist.

## 3. Der Host sucht nach einem bekannten Controller

Direkt nach dem Start fragt sich der Host: Kenne ich schon einen M5-Controller?
Wenn ein Controller bereits erfolgreich eingerichtet wurde, soll er nicht bei
jedem Start neu über USB konfiguriert werden. Der Host lädt deshalb eine lokale
Einrichtung und wartet darauf, dass der Controller über WLAN/WebSocket wieder
auftaucht.

Die wichtigste Datei dafür ist
[src/lib/server/device/usb-setup.ts](../src/lib/server/device/usb-setup.ts).
Dort lebt der Status des M5-Setups als kleine Zustandsmaschine.

Besonders wichtig sind:

- `startSavedControllerDiscovery()` lädt die gespeicherte Einrichtung und startet
  die Suche nach dem Controller.
- `recordPairedDeviceFrame()` markiert den Controller als bereit, sobald ein
  gültiger Frame vom gepaarten Gerät ankommt.
- `recordPairedDeviceSocketClose()` setzt den Zustand zurück auf Suche, wenn
  die Verbindung verloren geht.
- `getUsbSetupSnapshot()` liefert den kompakten Status für Konsole und CLI.

Die gespeicherte Controller-Konfiguration liegt lokal hier:

```txt
.icaros/m5-controller.toml
```

Der Pairing-Token liegt getrennt davon hier:

```txt
.icaros/secrets/m5-device-pairing-token
```

Diese Trennung ist wichtig. Der Controller darf nur dann als bekannt gelten,
wenn seine gespeicherte URL noch zum aktuellen Host-Token passt. Wenn ein alter
Controller eine alte URL gespeichert hat, erkennt der Host das über den
Token-Fingerprint und fordert ein neues Setup.

So entsteht ein angenehmer Normalfall: Du startest den Host, der bekannte M5 ist
im selben Netzwerk, der M5 verbindet sich wieder, und die Konsole wird nach dem
ersten gültigen Frame grün.

## 4. Wenn der M5 neu oder veraltet ist, gehst du über USB

Wenn der Controller neu ist, nicht wiedergefunden wird oder eine alte Firmware
hat, führt dich der Host über den USB-Weg. USB ist hier nicht der normale
Betrieb, sondern der Einrichtungs- und Prüfkanal. Der spätere Betrieb läuft über
WLAN und den Geräte-WebSocket.

Die Konsole und die CLI verwenden dafür denselben Host-Core:
[src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts).
Diese Datei ist eine dünne Orchestrierungsschicht. Sie sorgt dafür, dass Web-UI
und CLI nicht zwei verschiedene Pairing-Logiken entwickeln.

Du findest dort diese zentralen Funktionen:

- `probeM5UsbController()` startet eine reine USB-Prüfung.
- `flashM5Firmware()` startet ein Firmware-Update, falls es ausdrücklich
  erlaubt ist.
- `startM5UsbPairing()` schreibt WLAN- und Host-Verbindungsdaten auf den
  Controller.
- `getM5PairingStatus()` liefert den aktuellen Status und eine redaktierte
  Geräte-URL.

Der eigentliche USB-Adapter ist
[scripts/connect-m5-usb.py](../scripts/connect-m5-usb.py). Er sucht einen
seriellen Port, spricht den Controller an, liest Diagnose- und Telemetriedaten
und schreibt Setup-Daten, wenn du ein Pairing startest.

Die erwartete Firmware-Version steht zentral in
[src/lib/server/device/m5-firmware-version.ts](../src/lib/server/device/m5-firmware-version.ts):

```txt
0.2.2-icaros-ws-reconnect
```

Der Host prüft diese Version, weil alte Firmware zwar noch USB-Daten liefern
kann, sich aber bei WLAN, Diagnose oder Reconnect anders verhalten kann. Erst
wenn die Firmware passt, ist der Controller für das aktuelle Host-Verhalten
wirklich verlässlich.

Ein Firmware-Update passiert nicht aus Versehen. Flashen ist nur möglich, wenn
du es ausdrücklich erlaubst:

```txt
ICAROS_ALLOW_M5_FIRMWARE_UPDATE=true
```

Das hält den alltäglichen Prüf- und Pairing-Workflow leicht zugänglich, macht
Firmware-Schreiben aber zu einer bewussten Aktion.

## 5. Der M5 kommt in den laufenden Betrieb

Nach dem Pairing kennt der M5 die Geräte-URL des Hosts. Er verbindet sich über
den plain WebSocket `/ws/device` und sendet rohe Controller-Frames. Der Host
nimmt diese Verbindung aber nicht einfach blind an: Zuerst prüft er den
Pairing-Token.

Die Token- und URL-Logik liegt in
[src/lib/server/device/pairing.ts](../src/lib/server/device/pairing.ts).

Hier findest du unter anderem:

- `createPairedDeviceWebSocketUrl()` baut die URL, die auf den M5 geschrieben
  wird.
- `isDevicePairingRequest()` prüft eingehende Geräteverbindungen.
- `redactDevicePairingToken()` sorgt dafür, dass Logs und UI keine Secrets
  anzeigen.
- `resolveDeviceWebSocketOrigin()` trennt Browser-WSS und M5-WS sauber.

Die WebSocket-Annahme selbst passiert im Gateway:
[src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts).

Dort sind besonders wichtig:

- `#handleUpgrade()` erkennt `/ws/device`, prüft den Pairing-Token und lehnt
  falsche Geräteverbindungen ab.
- `#handleDeviceConnection()` liest M5-Frames, aktualisiert den M5-Status und
  veröffentlicht neue Controller-Daten.
- `#publishStaleControlIfNeeded()` erkennt, wenn M5-Daten veraltet sind, und
  schickt neutrale Safe-Mode-Werte.

Die Idee dahinter ist einfach: Der M5 darf Rohdaten senden, aber nur an den
Host. Kein VR Client soll direkt vom M5 lesen. So bleibt die Experience frei von
Firmwaredetails und bekommt später nur stabile Steuerdaten.

## 6. Aus Rohdaten werden Steuerdaten

Jetzt passiert die eigentliche Übersetzung. Ein Controller sendet Sensordaten,
aber eine Experience braucht keine Sensor-Rohformate. Sie braucht eine einfache,
stabile Steuerinformation: Pitch, Roll, Qualität, Safe-Mode und Zeitstempel.

Diese Umwandlung lebt in
[src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts).

Die wichtigsten Funktionen sind:

- `parseM5Frame()` liest eingehende JSON-Frames.
- `isM5OrientationFrame()` erkennt relevante Orientierungsdaten.
- `normalizeM5Frame()` wandelt M5-Werte in den Bereich `-1..1`.
- `smoothControlOrientation()` glättet Bewegungen.
- `createNeutralControl()` erzeugt neutrale Safe-Mode-Werte.

Das Ergebnis heißt `control.orientation`. Diese Nachricht ist klein genug, damit
Experience-Code einfach bleibt, aber vollständig genug, um eine Flug- oder
Bewegungssteuerung zu bauen.

Der wichtigste Designgedanke: Die Experience soll nicht wissen müssen, welcher
Controller, welche Firmware oder welches Rohformat gerade verwendet wird. Sie
sieht nur normalisierte Steuerung.

## 7. Runtime Clients melden sich an

Eine VR Experience läuft separat, zum Beispiel als eigener SvelteKit/Three.js
Client. Beim Start öffnet sie einen sicheren WebSocket zum Host und stellt sich
mit `client.hello` vor. Damit sagt sie: Ich bin ein konkreter Runtime Client,
ich gehöre zu dieser Experience, und unter dieser HTTPS-URL kann ich gestartet
werden.

Der öffentliche Client-Helfer liegt in
[src/lib/client/experience-client.ts](../src/lib/client/experience-client.ts).

Auf Client-Seite findest du dort:

- `createIcarosExperienceClient()` erzeugt den Browser-Client.
- `start()` öffnet den Runtime-WebSocket.
- `#sendHello()` sendet `client.hello` mit `clientId`, `experienceId`, Titel,
  URL und User-Agent.
- `#startHeartbeat()` sendet regelmäßig `client.heartbeat`.
- `onOrientation()` registriert Listener für normalisierte Controller-Daten.
- `dispose()` räumt Socket, Heartbeat und Listener auf.

Auf Host-Seite wird der Handshake in
[src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts) angenommen. Die
Verwaltung konkreter Clients liegt in
[src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts).

Dort geht es vor allem um diese Funktionen:

- `registerHello()` trägt einen konkreten Client ein.
- `recordHeartbeat()` hält Clients frisch.
- `markStaleClients()` markiert nicht mehr antwortende Clients als `stale`.
- `listRuntimeClients()` liefert die Liste für die Konsole.
- `findSelectableClient()` sorgt dafür, dass nur online Clients aktiv gewählt
  werden können.

Warum konkrete Clients und nicht nur Experience-IDs? Weil dieselbe Experience
mehrfach offen sein kann: Desktop-Browser, Quest-Browser, Testfenster. Der Host
muss wissen, welcher konkrete Client gerade die Steuerung bekommen soll.

## 8. Du wählst einen aktiven Client

Registrierung allein bedeutet noch nicht, dass ein Client gesteuert wird. Die
Konsole zeigt alle registrierten Runtime Clients und du wählst genau einen als
aktiv aus.

Die Auswahl läuft über `setActiveClient` in
[src/routes/+page.server.ts](../src/routes/+page.server.ts). Der kleine
Server-Core dazu liegt in
[src/lib/server/station/active-experience.ts](../src/lib/server/station/active-experience.ts),
der Zustand in [src/lib/server/station/state.ts](../src/lib/server/station/state.ts).

Der Host speichert:

```ts
{
	activeClientId: string | null;
	activeExperienceId: string | null;
}
```

`activeClientId` ist die eigentliche Routing-Wahrheit. `activeExperienceId`
bleibt als abgeleitete Information erhalten, weil sie für Anzeige und
Kompatibilität hilfreich ist.

Sobald sich der aktive Client ändert, sendet der Host neue `station.state`- und
`runtime.clients`-Nachrichten an die Runtime-Verbindungen. So wissen Clients,
ob sie aktiv sind oder nur registriert mitlaufen.

## 9. `/launch` bringt das Headset zum richtigen Client

Wenn du ein Headset verwendest, soll es nicht irgendeine alte oder hart
konfigurierte Experience-URL öffnen. Es öffnet den Host. Der Host schaut nach,
welcher Runtime Client gerade aktiv ist, und leitet dann auf genau diesen Client
weiter.

Die Route ist [src/routes/launch/+server.ts](../src/routes/launch/+server.ts).
Die eigentliche Entscheidung liegt in
[src/lib/server/experiences/launch-routing.ts](../src/lib/server/experiences/launch-routing.ts).

Die zentrale Funktion ist `resolveExperienceLaunchUrl()`. Sie prüft, ob ein
aktiver Client existiert, online ist und eine gültige HTTPS-URL registriert hat.

Wenn alles passt, antwortet `/launch` mit einem `307` Redirect auf die
registrierte Client-URL. Wenn nichts aktiv oder die URL unsicher ist, schlägt
die Route mit einer klaren Fehlermeldung fehl.

Das ist absichtlich streng. `/launch` soll nicht raten, keine HTTP-Fallbacks
nutzen und keine Experience-Builds ausliefern. Es ist ein sicherer Einstieg zum
bereits laufenden aktiven Client.

## 10. Nur der aktive Client bekommt Steuerung

Viele Clients können verbunden sein, aber nur einer soll echte Steuerdaten
bekommen. Das verhindert Verwirrung und macht Tests nachvollziehbar.

Die Entscheidung liegt in
[src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts).

Wichtige Funktionen:

- `sendControlToActiveClientAndOperators()` sendet `control.orientation` nur an
  den aktiven Client und an Diagnose-Operatoren.
- `sendControlToClient()` sendet beim Registrieren direkt den letzten bekannten
  Control-State, aber nur wenn der Client aktiv sein darf.
- `canReceiveControl()` ist die interne Grenze: Experience Clients brauchen die
  passende `activeClientId`, Operator-Diagnosen dürfen spiegeln.

Die Experience bekommt dadurch nur das, was sie wirklich verarbeiten soll:
normalisierte, sichere Steuerdaten. Alle anderen Clients sehen weiterhin
Station-State und Client-Listen, aber keine aktive Steuerung.

## 11. Diagnose und Automation verwenden denselben Host-Core

Diagnose ist wichtig, aber sie soll keine zweite Wahrheit erzeugen. Deshalb
sprechen Web-Konsole und CLI dieselben Host-Funktionen an.

Die JSON-Diagnose-Route ist
[src/routes/api/m5-pairing/+server.ts](../src/routes/api/m5-pairing/+server.ts).
Die CLI ist [scripts/m5-pairing-cli.ts](../scripts/m5-pairing-cli.ts).

Beide Wege landen im gemeinsamen Service:
[src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts).

Das bedeutet: Wenn die Konsole einen M5-Status zeigt und die CLI einen Snapshot
liest, kommen beide aus demselben Statusmodell. Die CLI erfindet keinen eigenen
Token, keine eigene Geräte-URL und keine eigene Pairing-Logik.

Für schnelle Erreichbarkeit gibt es außerdem
[src/routes/health/+server.ts](../src/routes/health/+server.ts). Dieser Endpoint
sagt nur: Der Host ist erreichbar und antwortet.

## 12. Safe-Mode ist die ruhige Fehlerstrategie

Wenn Daten fehlen, alt sind oder eine Verbindung verloren geht, soll die
Experience nicht mit alten Bewegungen weiterfliegen. Der Host schickt dann
neutrale Safe-Mode-Werte.

Das passiert an mehreren Stellen gemeinsam:

- [src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts) erkennt
  fehlende oder stale M5-Frames.
- [src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts)
  erzeugt neutrale Controls.
- [src/lib/client/experience-client.ts](../src/lib/client/experience-client.ts)
  liefert diese Controls an die Experience weiter.

Eine Experience sollte bei `safeMode: true` Bewegung stoppen oder neutralisieren.
Das ist kein Sonderfall, sondern Teil des normalen Betriebsmodells. Geräte und
Netzwerke können ausfallen; der Host macht diesen Zustand sichtbar und
vorhersagbar.

## 13. Was der Host bewusst nicht macht

Ein gutes System ist nicht nur durch seine Funktionen klar, sondern auch durch
seine Grenzen. Der Host macht einiges absichtlich nicht.

Der Host:

- rendert keine Three.js-Welt
- serviert keine Experience-Builds
- lässt Experiences nicht direkt mit dem M5 sprechen
- leitet `/launch` nicht auf HTTP weiter
- verwaltet keine parallele zweite Pairing-Logik in der CLI
- hardcodiert nicht alle Experiences in Host-Code

Diese Grenzen sind in [AGENTS.md](../AGENTS.md) und
[docs/architecture.md](architecture.md) festgehalten. Sie machen das System
leichter erweiterbar: Neue Experiences können entstehen, ohne dass der Host ihre
3D-Welt kennen muss.

## 14. Die kurze Gesamtreise

Wenn du den Host als Ablauf liest, passiert Folgendes:

1. Der Server startet über [server/index.ts](../server/index.ts).
2. HTTPS wird geprüft und die SvelteKit-App wird geladen.
3. Das Runtime-Gateway öffnet `/ws/runtime` für Browser/VR Clients.
4. Der M5-Geräteport öffnet `/ws/device` für gepaarte Controller.
5. Der Host lädt eine gespeicherte Controller-Einrichtung, falls vorhanden.
6. Die Operator-Konsole auf `/` zeigt Zustand, URLs und Aktionen.
7. Ein M5 verbindet sich über WLAN/WebSocket oder wird per USB eingerichtet.
8. Der Host prüft Firmware, Pairing-Token und eingehende Frames.
9. Rohdaten werden normalisiert, geglättet und safe-mode-fähig gemacht.
10. VR Clients melden sich mit `client.hello` an.
11. Die Konsole wählt einen konkreten aktiven Client.
12. `/launch` leitet Headsets auf diesen aktiven HTTPS-Client weiter.
13. Nur dieser Client bekommt `control.orientation`.
14. Bei Verbindungsverlust sendet der Host neutrale Safe-Mode-Werte.

So entsteht die eigentliche Rolle des Icaros Host: Er ist nicht die Experience,
sondern die verlässliche Station dazwischen. Er hält die wechselhaften Dinge -
Geräte, Netzwerk, Pairing, Startreihenfolge, Verbindungsverlust - vom
Experience-Code fern und gibt stattdessen eine kleine, klare
Runtime-Schnittstelle weiter.
