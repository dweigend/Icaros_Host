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
- Verwende diese ID: "<DEINE-EXPERIENCE-ID>"
- Diese ID muss beim Server registriert werden.

Server-Verbindung:
- WebSocket-Pfad: "/ws/runtime"
- Wenn die Seite über http läuft, verwende ws://
- Wenn die Seite über https läuft, verwende wss://
- Baue die URL aus window.location:
  - ws(s)://<aktueller-host>/ws/runtime

Registrierung:
Nach dem Öffnen des WebSockets sende diese JSON-Nachricht:

{
  "type": "client.register",
  "payload": {
    "role": "experience",
    "id": "<EINDEUTIGE-CLIENT-ID>",
    "experienceId": "<DEINE-EXPERIENCE-ID>"
  }
}

Steuerdaten:
Der Server sendet Nachrichten vom Typ "control.orientation".

Payload:

{
  "pitch": number,
  "roll": number,
  "quality": number,
  "source": "external",
  "safeMode": boolean,
  "timestamp": number
}

Bedeutung:
- pitch: normalisierte Vor-/Zurück-Neigung im Bereich -1 bis 1
- roll: normalisierte Links-/Rechts-Neigung im Bereich -1 bis 1
- quality: Signalqualität im Bereich 0 bis 1
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
- WebSocket-Registrierung beim Host.
- Anwendung der empfangenen pitch/roll-Steuerdaten auf die VR-Szene.
- Sauberes Cleanup beim Verlassen der Seite.
