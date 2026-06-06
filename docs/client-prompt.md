Bitte baue eine Three.js/WebXR VR-Experience.

Setze kein bestehendes Projektwissen voraus. Die Anwendung ist ein externer Client für einen bereits vorhandenen Host-Server. Der Host-Server läuft getrennt von dieser Experience und sendet Steuerdaten über WebSocket.

Ziel:
- Baue eine browserbasierte VR-Experience mit Three.js.
- Die Experience rendert die Szene selbst.
- Die Experience verbindet sich beim Start mit dem Host-Server.
- Die Experience registriert sich dort mit einer festen experienceId.
- Die Experience nutzt nur die vom Server gesendeten normalisierten Steuerdaten.
- Keine eigene Hardware- oder Gerätelogik einbauen.

Experience-ID:
- Verwende diese ID: "mountain-flight"
- Diese ID muss beim Server registriert werden.

Server-Verbindung:
- WebSocket-Pfad: "/ws/runtime"
- Verwende fuer Quest/WebXR HTTPS und WSS.
- Die Experience-URL muss fuer den Host-Handshake mit https:// beginnen.
- Baue die URL aus window.location:
  - wss://<aktueller-host>/ws/runtime

Registrierung:
Erzeuge eine stabile clientId pro Browser-Instanz:

```ts
localStorage.getItem("icaros.clientId") ?? crypto.randomUUID()
```

Nach dem Öffnen des WebSockets sende diese JSON-Nachricht:

{
  "type": "client.hello",
  "payload": {
    "role": "experience",
    "clientId": "<STABILE-CLIENT-ID>",
    "experienceId": "mountain-flight",
    "title": "Mountain Flight",
    "url": "https://<aktueller-host>/"
  }
}

Setze die Runtime erst nach `client.registered` auf registriert. Sende danach
alle 3-5 Sekunden:

{
  "type": "client.heartbeat",
  "payload": {
    "clientId": "<STABILE-CLIENT-ID>"
  }
}

Steuerdaten:
Der Server sendet Nachrichten vom Typ "control.orientation".

Payload:

{
  "pitch": number,
  "roll": number,
  "quality": number,
  "source": "m5",
  "safeMode": boolean,
  "timestamp": number
}

Bedeutung:
- pitch: normalisierte Vor-/Zurück-Neigung im Bereich -1 bis 1
- roll: normalisierte Links-/Rechts-Neigung im Bereich -1 bis 1
- quality: Signalqualität im Bereich 0 bis 1
- source: normalisierte Host-Quelle, aktuell "m5"
- safeMode: wenn true, keine Bewegung anwenden
- timestamp: Zeitstempel vom Server

Steuerungslogik:
- Wenn safeMode true ist: Bewegung stoppen oder neutral halten.
- Wenn safeMode false ist:
  - pitch steuert Vorwärts/Rückwärts-Bewegung oder Kamera-/Avatar-Neigung.
  - roll steuert Links/Rechts-Bewegung oder Rotation.
- Werte außerhalb von -1 bis 1 ignorieren oder clampen.
- Keine Rohdaten erwarten, nur diese normalisierte API verwenden.

Architektur:
- Trenne Rendering, WebSocket-Client und Steuerungszustand in kleine Module.
- Der WebSocket-Client soll start() und dispose() haben.
- Der aktuelle Steuerungszustand soll typisiert sein.
- Externe WebSocket-Nachrichten vor Nutzung validieren.
- Keine großen Frameworks zusätzlich einbauen, wenn Three.js reicht.

Ergebnis:
- Eine lauffähige Three.js/WebXR Experience.
- Klare Stelle, an der experienceId gesetzt wird.
- WebSocket-Handshake per `client.hello`, `client.registered` und Heartbeat beim Host.
- Anwendung der empfangenen pitch/roll-Steuerdaten auf die VR-Szene.
- Sauberes Cleanup beim Verlassen der Seite.
