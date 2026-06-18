# Experience Client Prompt

Purpose: this prompt helps generate an external Three.js/WebXR experience for
Icaros Host without duplicating the canonical runtime contract. Use it together
with [Experience Client API](client-api.md). If this prompt and the API document
disagree, the API document wins.

Bitte baue eine Three.js/WebXR VR-Experience als externen Client fuer Icaros
Host.

## Kontext

- Setze kein bestehendes Projektwissen voraus.
- Der Host-Server laeuft getrennt von dieser Experience.
- Die Experience rendert die Szene selbst.
- Die Experience verbindet sich fuer Steuerdaten mit `/ws/control/main`.
- Optional registriert sie sich ueber `/ws/runtime`, damit sie in der
  Launch-Auswahl erscheint.
- Die Experience nutzt exakt den Envelope, die optionale Registrierung, den
  Heartbeat und das `control.orientation`-Payload aus `docs/client-api.md`.
- Keine eigene Hardware-, M5-, Pairing- oder Geraetelogik einbauen.

## Experience

- Beispielwerte vor Projektstart ersetzen.
- Experience-ID: `mountain-flight`
- Titel: `Mountain Flight`
- Ziel: browserbasierte VR-Experience mit Three.js und WebXR
- Laufzeit: HTTPS fuer Quest/WebXR, WSS fuer Host-Control-Stream und optionalen
  Host-Runtime-Socket

## Architektur

- Trenne Rendering, Control-Stream-Client, optionale Launch-Registration und
  Steuerungszustand in kleine Module.
- Der WebSocket-Client hat klare Lifecycle-Funktionen wie `start()` und
  `dispose()`.
- Externe WebSocket-Nachrichten werden vor Nutzung validiert.
- Der aktuelle Steuerungszustand ist typisiert.
- Keine grossen Frameworks zusaetzlich einbauen, wenn Three.js reicht.

## Steuerungslogik

- Verwende nur normalisierte `pitch`- und `roll`-Werte aus
  `control.orientation`.
- Der Host neutralisiert fehlende, veraltete oder unsichere Controllerdaten
  bereits serverseitig.
- `pitch` kann Vorwaerts/Rueckwaerts-Bewegung oder Neigung steuern und `roll`
  Links/Rechts-Bewegung oder Rotation.
- Werte ausserhalb der dokumentierten Bereiche ignorieren oder defensiv
  clampen.
- Keine Rohdaten erwarten und keine Verbindung zum M5 oeffnen.

## Ergebnis

- Eine lauffaehige Three.js/WebXR Experience.
- Eine klare Stelle, an der `experienceId` gesetzt wird.
- Control-Stream-Abo auf `/ws/control/main`.
- Optionaler Runtime-Handshake mit enveloped `client.hello`,
  `client.registered` und `client.heartbeat` gemaess `docs/client-api.md`.
- Anwendung der empfangenen `pitch`/`roll`-Steuerdaten auf die VR-Szene.
- Sauberes Cleanup beim Verlassen der Seite.
