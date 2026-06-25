# Verbindung zum ICAROS Host

Diese Seite erklaert die zwei kleinen Beispielskripte im Client-Repository:

- `docs/student-handshake-example.ts`
- `docs/student-control-stream-example.ts`

Die beiden Skripte zeigen nur die Host-Kommunikation. Rendering, VR-Logik,
Szenen, Physik, UI und Asset-Loading gehoeren in dein eigenes Projekt.

```txt
M5 Controller -> ICAROS Host -> dein Client
```

Der Client verbindet sich niemals direkt mit dem M5 Controller. Der Host liest
die Rohdaten, normalisiert sie und sendet deinem Client einfache Werte wie
`pitch`, `roll` und `quality`.

## Die zwei Aufgaben des Clients

| Aufgabe | WebSocket | Beispielskript |
| --- | --- | --- |
| Launch-Handshake | `wss://<host>:5183/ws/runtime` | `student-handshake-example.ts` |
| Controller-Daten lesen | `wss://<host>:5183/ws/control/main` | `student-control-stream-example.ts` |

Die Host-Origin kommt aus der Host-WebUI:

```txt
https://<host-lan-ip-oder-name>:5183
```

Beispiele:

```txt
https://192.168.50.196:5183
https://icaros-host.local:5183
```

Aus dieser HTTPS-Origin werden die WebSocket-URLs abgeleitet. Die
Beispielskripte nutzen dafuer vorhandene Host-Helfer statt selbst Strings
zusammenzubauen.

Zitat aus `student-handshake-example.ts`:

```ts
const RUNTIME_PATH = '/ws/runtime';
const HEARTBEAT_MS = 4_000;
```

Zitat aus `student-control-stream-example.ts`:

```ts
const CONTROL_PATH = '/ws/control/main';
```

## Beispiel-Client starten

1. Starte den Host.

   ```sh
   cd /Users/weigend/Documents/GitHub/Icaros_Host
   bun run build
   bun start
   ```

2. Oeffne die Host-Konsole.

   ```txt
   https://<host-lan-ip-oder-name>:5183/
   ```

3. Starte den Beispiel-Client mit der Host-Origin.

   ```sh
   cd /Users/weigend/Documents/GitHub/Icaros_VR_Client_neu
   bun install
   bun start https://<host-lan-ip-oder-name>:5183
   ```

4. Der Client laeuft typischerweise unter:

   ```txt
   https://<client-lan-ip-oder-name>:5174/
   ```

5. In der Host-Konsole sollte der Client als Launch-Ziel erscheinen.

6. Waehle den Client in der Host-Konsole aus.

7. Oeffne in der VR-Brille nur die feste Launch-URL des Hosts:

   ```txt
   https://<host-lan-ip-oder-name>:5183/launch
   ```

Der Host leitet `/launch` per HTTP `307` auf die registrierte HTTPS-URL des
ausgewaehlten Clients weiter.

## Handshake-Skript

Das Handshake-Skript verbindet sich mit `/ws/runtime`. Direkt nach dem Oeffnen
des WebSockets sendet der Client `client.hello`. Nach `client.registered`
sendet er regelmaessig `client.heartbeat`.

Zitat aus `student-handshake-example.ts`:

```ts
function attachEvents(runtime: Runtime): void {
	runtime.socket.addEventListener('open', () => sendHello(runtime));
	runtime.socket.addEventListener('message', (event: MessageEvent<string>) =>
		handleHostMessage(runtime, event.data)
	);
	runtime.socket.addEventListener('close', () => window.clearInterval(runtime.heartbeatId));
}
```

Die wichtige Idee: Die Export-Funktion steht unten und setzt nur vorbereitete
Einzelfunktionen zusammen.

Zitat aus `student-handshake-example.ts`:

```ts
export function startHandshake(options: HandshakeOptions): () => void {
	// Der Export setzt die oben definierten Einzelfunktionen zum Handshake zusammen.
	const socket = new WebSocket(createHostWebSocketUrl(options.hostOrigin, RUNTIME_PATH));
	const runtime: Runtime = { options, socket };
	attachEvents(runtime);
	return () => {
		window.clearInterval(runtime.heartbeatId);
		socket.close();
	};
}
```

### Was `client.hello` enthaelt

Der Client meldet sich mit diesen Kerndaten an:

| Feld | Bedeutung |
| --- | --- |
| `clientId` | Eindeutige ID dieser laufenden Browser- oder Client-Instanz. |
| `experienceId` | Stabile Projekt-ID, zum Beispiel `icaros-demo-flight`. |
| `title` | Anzeigename in der Host-Konsole. |
| `url` | HTTPS-Adresse, zu der `/launch` weiterleiten darf. |
| `userAgent` | Optionaler Hinweis auf Browser oder Umgebung. |

Zitat aus `student-handshake-example.ts`:

```ts
createClientHelloMessage({
	clientId: runtime.options.clientId,
	experienceId: runtime.options.experienceId,
	title: runtime.options.title,
	url: runtime.options.clientUrl,
	userAgent: navigator.userAgent
})
```

Die `url` muss eine echte HTTPS-URL sein. `http://`, leere URLs oder lokale
Adressen, die die VR-Brille nicht erreichen kann, werden vom Host abgelehnt.

### Was der Host antwortet

Nach `client.hello` kommen fuer den Client zwei relevante Antworten:

| Antwort | Bedeutung |
| --- | --- |
| `client.registered` | Registrierung ist gueltig, Heartbeats koennen starten. |
| `client.rejected` | Registrierung ist ungueltig, der Grund steht im Payload. |

Das Skript nutzt Early Returns: Ungueltige oder irrelevante Nachrichten werden
sofort verlassen.

Zitat aus `student-handshake-example.ts`:

```ts
const registered = readRuntimeClientRegisteredMessage(message);
if (registered !== null) {
	handleRegistered(runtime, registered.payload.clientId);
	return;
}
```

Wenn keine Heartbeats mehr kommen, markiert der Host den Client als `stale`.
Ein stale Client ist kein gueltiges Launch-Ziel.

## Controller-Stream-Skript

Das Controller-Skript verbindet sich mit `/ws/control/main`. Es sendet selbst
keine Nachricht an den Host. Es liest nur `control.orientation`, validiert die
Nachricht und gibt die typisierten Werte an den Client weiter.

Zitat aus `student-control-stream-example.ts`:

```ts
function readOrientation(rawValue: string): ControlOrientation | null {
	const message = readControlOrientationMessage(parseJsonMessage(rawValue));
	if (message === null) {
		return null;
	}

	return message.payload;
}
```

Die Weitergabe an den Client passiert erst nach der Validierung.

Zitat aus `student-control-stream-example.ts`:

```ts
function handleControlMessage(
	rawValue: string,
	applyToClient: (orientation: ControlOrientation) => void
): void {
	const orientation = readOrientation(rawValue);
	if (orientation === null) {
		return;
	}

	// Ab hier sind die Host-Daten geprueft und fuer den Client sicher nutzbar.
	applyToClient(orientation);
}
```

Auch hier setzt die Export-Funktion nur die vorher definierten Bausteine
zusammen.

Zitat aus `student-control-stream-example.ts`:

```ts
export function startControllerStream(
	hostOrigin: string,
	applyToClient: (orientation: ControlOrientation) => void
): () => void {
	// Der Export setzt die oben definierten Einzelfunktionen zum Controller-Stream zusammen.
	const socket = new WebSocket(createHostWebSocketUrl(hostOrigin, CONTROL_PATH));
	attachEvents(socket, applyToClient);
	return () => socket.close();
}
```

## `control.orientation`

Der Host sendet normalisierte Controller-Daten:

```json
{
  "protocol": "neural-flight.v1",
  "type": "control.orientation",
  "stationId": "station-a",
  "source": { "role": "host", "id": "icaros-host" },
  "timestamp": 1760000000000,
  "payload": {
    "pitch": 0.12,
    "roll": -0.35,
    "quality": 1,
    "controllerType": "m5"
  }
}
```

Die Nutzdaten sind klein:

| Feld | Bereich | Bedeutung |
| --- | --- | --- |
| `pitch` | `-1..1` | Neigung nach vorne oder hinten. |
| `roll` | `-1..1` | Neigung nach links oder rechts. |
| `quality` | `0..1` | Qualitaet des Controller-Signals. |
| `controllerType` | `m5` | Quelle der normalisierten Steuerung. |

Wenn der Controller fehlt, unsichere Werte liefert oder stale ist, sendet der
Host neutrale Werte:

```json
{
  "pitch": 0,
  "roll": 0,
  "quality": 0,
  "controllerType": "m5"
}
```

`quality: 0` bedeutet: neutral weiterlaufen, nicht abstuerzen, keine M5-Rohdaten
suchen.

## Was nicht in den Client gehoert

Diese Endpunkte und Daten sind nicht fuer Experience Clients gedacht:

| Endpunkt oder Daten | Warum nicht? |
| --- | --- |
| `/ws/device` | Nur fuer den M5 Controller mit Pairing-Token. |
| `/api/m5-pairing` | Diagnose und Setup fuer Host, CLI und Konsole. |
| M5-Rohdaten | Werden nur im Host ausgewertet und vom Client nicht benoetigt. |
| `runtime.clients` | Fuer Operator-Konsole und Diagnose, nicht fuer normale Steuerung. |

## Hauefige Fehler

| Fehler | Ursache | Loesung |
| --- | --- | --- |
| Client erscheint nicht in der Host-Konsole. | Kein `/ws/runtime` oder kein gueltiges `client.hello`. | Runtime-Socket und Registrierungsdaten pruefen. |
| `client.hello url must be an https URL`. | `url` ist `http://`, leer oder fuer die Brille nicht erreichbar. | `url` auf `https://<client-lan-ip>:<port>/` setzen. |
| Controls kommen nicht an. | Host-Origin falsch, Zertifikat nicht akzeptiert oder WSS blockiert. | Host-URL im Browser oeffnen und Zertifikat akzeptieren. |
| `/launch` startet falschen oder keinen Client. | Kein online Client ausgewaehlt oder Heartbeat gestoppt. | Client in der Host-Konsole auswaehlen und Heartbeats pruefen. |
| Client versucht M5-Daten direkt zu lesen. | Falsche Architekturgrenze. | Nur `/ws/control/main` verwenden. |

## Merksatz

Der Host kennt nur zwei Dinge von deinem Client: Wo er per HTTPS erreichbar ist
und wie er normalisierte Controller-Daten empfaengt. Alles andere bleibt frei in
deinem Projekt.
