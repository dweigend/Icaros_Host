# Eine Reise durch den Icaros Host

Purpose: dieses Dokument erklärt den Icaros Host als zusammenhängenden Ablauf.
Es beschreibt, was nach dem Start passiert, welche Funktionen bereitgestellt
werden und wo die wichtigsten Stellen im Code liegen.

Der Icaros Host ist die technische Mitte der Installation. Er ist nicht die VR
Experience selbst. Er ist eher die Station, an der alle Informationen
zusammenlaufen: Controller-Daten, angemeldete Experience Clients, Auswahl des
aktiven Clients, Start-Links, Diagnose und sichere Verbindungen.

Die wichtigste Idee ist: Der Host macht aus vielen lokalen Einzelteilen ein
geordnetes System. Ein M5-Controller sendet rohe Bewegungsdaten. Ein VR Client
rendert eine Experience. Eine Person bedient die Konsole. Der Host verbindet
diese Teile, prüft sie, hält den Zustand fest und gibt nur die Daten weiter, die
die Experience wirklich braucht.

## 1. Der Server Startet

High-Level: Beim Start wird zuerst die technische Basis aufgebaut. Der Host
prüft, ob er als HTTPS-Server starten kann, lädt die SvelteKit-App und öffnet
die WebSocket-Gateways. Erst danach sucht er nach einem bereits bekannten
Controller.

Der Startpunkt ist [server/index.ts](../server/index.ts). Diese Datei ist der
Produktions-Einstieg. Sie macht bewusst nur Start-Orchestrierung: Server
erzeugen, TLS laden, WebSockets anschließen, Ports öffnen und beim Beenden
aufräumen.

Wichtige Funktionen:

- `start()` baut den HTTPS-Server, lädt `build/handler.js` und hängt das
  WebSocket-Gateway an.
- `loadTlsOptions()` prüft, ob die Host-Zertifikate vorhanden sind.
- `resolvePlainDeviceWsPort()` entscheidet, ob ein separater plain-WS-Port für
  den M5 geöffnet wird.
- `createPlainDeviceServer()` öffnet den reinen M5-Gerätepfad.

Warum ist das so? Browser- und Headset-Oberflächen brauchen HTTPS. Ein Meta
Quest Browser akzeptiert WebXR und sichere WebSockets nur zuverlässig über
sichere Ursprünge. Der M5-Controller ist dagegen ein kleines Gerät mit
firmware-kompatiblem plain WebSocket. Deshalb trennt der Host zwei Welten:
HTTPS/WSS für Browser, plain WS nur für den M5-Geräteport.

Wenn alles läuft, stellt der Host typischerweise bereit:

```txt
https://localhost:5183/
https://<host-lan-ip-or-name>:5183/
ws://<host-lan-ip-or-name>:5184/ws/device
```

## 2. Die Operator-Konsole Wird Bereitgestellt

High-Level: Die Konsole ist die sichtbare Oberfläche des Hosts. Hier sieht man,
welche Verbindungen bekannt sind, ob der M5 bereit ist, welche Runtime Clients
online sind und welcher Client aktiv ist.

Die Route `/` wird in [src/routes/+page.server.ts](../src/routes/+page.server.ts)
und [src/routes/+page.svelte](../src/routes/+page.svelte) aufgebaut.

Wichtige Funktionen und Dateien:

- `load()` in [src/routes/+page.server.ts](../src/routes/+page.server.ts) sammelt
  den aktuellen Station-Zustand, Verbindung-URLs, den aktiven Launch-Target und
  den M5-Pairing-Status.
- `actions` in derselben Datei sind die Bedienhandlungen der Konsole:
  `setActiveClient`, `connectUsb`, `probeUsbController`, `flashM5Firmware`,
  `abortUsbWorkflow` und `setPairingDebug`.
- [src/routes/console-connection-addresses.svelte](../src/routes/console-connection-addresses.svelte)
  zeigt Host-, Runtime-, Launch- und M5-Adressen.
- [src/routes/console-controller-setup.svelte](../src/routes/console-controller-setup.svelte)
  zeigt den Controller-Setup-Status und die USB/Firmware-Aktionen.
- [src/routes/console-runtime-clients.svelte](../src/routes/console-runtime-clients.svelte)
  zeigt registrierte Runtime Clients und erlaubt die Auswahl des aktiven
  Clients.
- [src/routes/console-live-controller-data.svelte](../src/routes/console-live-controller-data.svelte)
  zeigt Live-Diagnose für normalisierte Controller-Daten.
- [src/routes/console-state.svelte.ts](../src/routes/console-state.svelte.ts)
  hält den route-lokalen Browser-State, Timer und Diagnose-WebSocket zusammen.

Die Konsole ist absichtlich eine einzige Seite. Dadurch bleibt der Host
verständlich: Es gibt eine Station, einen sichtbaren Zustand und eine klare
Stelle, an der entschieden wird, welcher Runtime Client aktiv ist.

## 3. Der Host Erinnert Sich An Einen Controller

High-Level: Ein M5-Controller muss nicht bei jedem Start neu eingerichtet
werden. Wenn er schon einmal erfolgreich gepairt wurde, speichert der Host die
wichtigen Daten lokal. Beim nächsten Start lädt er diese Einrichtung und wartet
darauf, dass der Controller wieder über WLAN/WebSocket auftaucht.

Die zentrale Datei dafür ist
[src/lib/server/device/usb-setup.ts](../src/lib/server/device/usb-setup.ts).

Wichtige Funktionen:

- `startSavedControllerDiscovery()` wird nach dem Serverstart aufgerufen. Sie
  liest die gespeicherte Controller-Konfiguration und startet die Suche über
  WLAN/WebSocket.
- `recordPairedDeviceFrame()` markiert den Controller als bereit, sobald ein
  gültiger Frame vom gepaarten Gerät ankommt.
- `recordPairedDeviceSocketClose()` setzt den Zustand zurück auf Suche, wenn
  die Verbindung verloren geht.
- `getUsbSetupSnapshot()` liefert den kompakten Status für Konsole und CLI.

Die gespeicherte Controller-Konfiguration liegt lokal in:

```txt
.icaros/m5-controller.toml
```

Der Pairing-Token liegt getrennt in:

```txt
.icaros/secrets/m5-device-pairing-token
```

Das ist wichtig, weil der Controller nur dann als bekannt gelten soll, wenn er
noch zum aktuellen Host-Token passt. Wenn ein alter Controller eine alte URL
gespeichert hat, erkennt der Host das über den Token-Fingerprint und fordert ein
neues Setup.

## 4. Ein Neuer Oder Alter M5 Wird Über USB Geprüft

High-Level: Wenn ein Controller neu ist, nicht wiedergefunden wird oder eine
alte Firmware hat, wird er über USB geprüft. USB ist hier der Einrichtungsweg.
Der spätere Betrieb läuft über WLAN/WebSocket.

Die Konsole und die CLI rufen denselben Host-Core auf:
[src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts).
Diese Datei ist bewusst eine dünne Orchestrierungsschicht. Sie verhindert, dass
Web-UI und CLI zwei unterschiedliche Pairing-Logiken entwickeln.

Wichtige Funktionen:

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
und schreibt Setup-Daten, wenn ein Pairing gestartet wird.

Die Firmware-Erwartung ist in
[src/lib/server/device/m5-firmware-version.ts](../src/lib/server/device/m5-firmware-version.ts)
zentral definiert. Die aktuell erwartete Version ist:

```txt
0.2.2-icaros-ws-reconnect
```

Warum ist das getrennt? Der Host soll zuverlässig wissen, ob ein Controller die
aktuelle Kommunikationslogik unterstützt. Alte Firmware kann noch USB-Daten
liefern, aber sich anders bei WLAN, Diagnose oder Reconnect verhalten. Deshalb
wird vor dem Einrichten geprüft, ob die Firmware passt.

Ein Firmware-Update ist nicht automatisch aktiv. Es ist nur möglich, wenn:

```txt
ICAROS_ALLOW_M5_FIRMWARE_UPDATE=true
```

gesetzt ist. Das ist eine Sicherheitsgrenze: Prüfen und Pairen darf leicht
zugänglich sein, Flashen aber nur bewusst.

## 5. Der M5 Verbindet Sich Über Den Geräte-WebSocket

High-Level: Wenn der M5 eingerichtet ist, kennt er die Geräte-URL des Hosts. Er
verbindet sich dann über den plain WebSocket `/ws/device` und sendet rohe
Controller-Frames. Der Host prüft zuerst den Pairing-Token und akzeptiert nur
gepaarte Geräte.

Die Token- und URL-Logik liegt in
[src/lib/server/device/pairing.ts](../src/lib/server/device/pairing.ts).

Wichtige Funktionen:

- `createPairedDeviceWebSocketUrl()` baut die URL, die auf den M5 geschrieben
  wird.
- `isDevicePairingRequest()` prüft eingehende Geräteverbindungen.
- `redactDevicePairingToken()` sorgt dafür, dass Logs und UI keine Secrets
  anzeigen.
- `resolveDeviceWebSocketOrigin()` trennt Browser-WSS und M5-WS sauber.

Die WebSocket-Annahme passiert im Gateway:
[src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts).

Wichtige Funktionen:

- `#handleUpgrade()` erkennt `/ws/device`, prüft den Pairing-Token und lehnt
  falsche Geräteverbindungen ab.
- `#handleDeviceConnection()` liest M5-Frames, aktualisiert den M5-Status und
  veröffentlicht neue Controller-Daten.
- `#publishStaleControlIfNeeded()` erkennt, wenn M5-Daten veraltet sind, und
  schickt neutrale Safe-Mode-Werte.

Die Intuition dahinter: Der M5 darf Rohdaten senden, aber nur an den Host. Kein
VR Client soll jemals direkt vom M5 lesen. So bleibt die Experience unabhängig
von Firmwaredetails.

## 6. Rohdaten Werden Zu Steuerdaten

High-Level: Ein Controller sendet Sensordaten, aber eine Experience braucht
keine Sensor-Rohformate. Sie braucht eine einfache, stabile Steuerinformation:
Pitch, Roll, Qualität, Safe-Mode und Zeitstempel.

Die Umwandlung liegt in
[src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts).

Wichtige Funktionen:

- `parseM5Frame()` liest eingehende JSON-Frames.
- `isM5OrientationFrame()` erkennt relevante Orientierungsdaten.
- `normalizeM5Frame()` wandelt M5-Werte in den Bereich `-1..1`.
- `smoothControlOrientation()` glättet Bewegungen.
- `createNeutralControl()` erzeugt neutrale Safe-Mode-Werte.

Das Ergebnis ist `control.orientation`. Diese Nachricht ist klein genug, damit
Experience-Code einfach bleibt, aber vollständig genug, um eine Flug- oder
Bewegungssteuerung zu bauen.

Der wichtigste Designgedanke: Die Experience soll nicht wissen müssen, welcher
Controller, welche Firmware oder welches Rohformat gerade verwendet wird. Sie
sieht nur normalisierte Steuerung.

## 7. Runtime Clients Melden Sich An

High-Level: Eine VR Experience läuft separat, zum Beispiel als eigener
SvelteKit/Three.js Client. Beim Start öffnet sie einen sicheren WebSocket zum
Host und stellt sich mit `client.hello` vor.

Der öffentliche Client-Helfer liegt in
[src/lib/client/experience-client.ts](../src/lib/client/experience-client.ts).

Wichtige Funktionen:

- `createIcarosExperienceClient()` erzeugt den Browser-Client.
- `start()` öffnet den Runtime-WebSocket.
- `#sendHello()` sendet `client.hello` mit `clientId`, `experienceId`, Titel,
  URL und User-Agent.
- `#startHeartbeat()` sendet regelmäßig `client.heartbeat`.
- `onOrientation()` registriert Listener für normalisierte Controller-Daten.
- `dispose()` räumt Socket, Heartbeat und Listener auf.

Auf der Host-Seite wird der Handshake in
[src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts) angenommen.
Die Verwaltung konkreter Clients liegt in
[src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts).

Wichtige Funktionen:

- `registerHello()` trägt einen konkreten Client ein.
- `recordHeartbeat()` hält Clients frisch.
- `markStaleClients()` markiert nicht mehr antwortende Clients als `stale`.
- `listRuntimeClients()` liefert die Liste für die Konsole.
- `findSelectableClient()` sorgt dafür, dass nur online Clients aktiv gewählt
  werden können.

Warum konkrete Clients und nicht nur Experience-IDs? Weil dieselbe Experience
mehrfach offen sein kann: Desktop-Browser, Quest-Browser, Testfenster. Der Host
muss wissen, welcher konkrete Client gerade die Steuerung bekommen soll.

## 8. Die Konsole Wählt Einen Aktiven Client

High-Level: Registrierung allein bedeutet noch nicht, dass ein Client gesteuert
wird. Die Konsole zeigt alle registrierten Runtime Clients und wählt genau einen
als aktiv aus.

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

## 9. `/launch` Bringt Das Headset Zum Richtigen Client

High-Level: Das Headset öffnet nicht direkt irgendeine Experience-URL aus einer
Konfigurationsdatei. Es öffnet den Host. Der Host entscheidet, welcher
registrierte Runtime Client aktiv ist, und leitet dann dorthin weiter.

Die Route ist [src/routes/launch/+server.ts](../src/routes/launch/+server.ts).
Die eigentliche Entscheidung liegt in
[src/lib/server/experiences/launch-routing.ts](../src/lib/server/experiences/launch-routing.ts).

Wichtige Funktion:

- `resolveExperienceLaunchUrl()` prüft, ob ein aktiver Client existiert, online
  ist und eine gültige HTTPS-URL registriert hat.

Wenn alles passt, antwortet `/launch` mit einem `307` Redirect auf die
registrierte Client-URL. Wenn nichts aktiv oder die URL unsicher ist, schlägt
die Route mit einer klaren Fehlermeldung fehl.

Das ist absichtlich streng. `/launch` soll nicht raten, keine HTTP-Fallbacks
nutzen und keine Experience-Builds ausliefern. Es ist ein sicherer Einstieg zum
bereits laufenden aktiven Client.

## 10. Nur Der Aktive Client Bekommt Steuerung

High-Level: Viele Clients können verbunden sein, aber nur einer soll die echten
Steuerdaten bekommen. Das verhindert Verwirrung und macht Tests nachvollziehbar.

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

## 11. Diagnose Und Automation Nutzen Den Gleichen Host-Core

High-Level: Diagnose ist wichtig, aber sie soll keine zweite Wahrheit erzeugen.
Deshalb sprechen Web-Konsole und CLI dieselben Host-Funktionen an.

Die JSON-Diagnose-Route ist
[src/routes/api/m5-pairing/+server.ts](../src/routes/api/m5-pairing/+server.ts).
Die CLI ist [scripts/m5-pairing-cli.ts](../scripts/m5-pairing-cli.ts).

Beide Wege landen im gemeinsamen Service:
[src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts).

Das bedeutet: Wenn die Konsole einen M5-Status zeigt und die CLI einen Snapshot
liest, kommen beide aus demselben Statusmodell. Die CLI erfindet keinen eigenen
Token, keine eigene Geräte-URL und keine eigene Pairing-Logik.

Für schnelle Erreichbarkeit gibt es außerdem
[src/routes/health/+server.ts](../src/routes/health/+server.ts). Dieser
Endpoint sagt nur: Der Host ist erreichbar und antwortet.

## 12. Safe-Mode Ist Die Ruhige Fehlerstrategie

High-Level: Wenn Daten fehlen, alt sind oder eine Verbindung verloren geht, soll
die Experience nicht mit alten Bewegungen weiterfliegen. Der Host schickt dann
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

## 13. Was Der Host Bewusst Nicht Macht

High-Level: Ein gutes System ist nicht nur durch seine Funktionen klar, sondern
auch durch seine Grenzen. Der Host macht einiges absichtlich nicht.

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

## 14. Die Kurze Gesamtreise

Wenn man den Host als Ablauf liest, passiert Folgendes:

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
sondern die verlässliche Station dazwischen. Er hält die unsauberen,
wechselhaften Dinge - Geräte, Netzwerk, Pairing, Startreihenfolge,
Verbindungsverlust - vom Experience-Code fern und gibt stattdessen eine kleine,
klare Runtime-Schnittstelle weiter.
