# Dashboard

Die Seite **Dashboard** ist eine feste Live-Übersicht für Passivbot-Konten. Sie verwendet ein freigegebenes Layout, damit die wichtigsten Daten sofort sichtbar sind und alle Benutzer dieselbe Informationshierarchie sehen.

## Layout

Die Seite ist in dieser Reihenfolge aufgebaut:

1. **Balance** — Gesamtguthaben, nicht realisierter PnL, Gesamteigenkapital und Kontenzeilen.
2. **Performance** — Tages-PnL und ADG nebeneinander.
3. **Risiko und Ausführung** — alle offenen Positionen in einer Tabelle über die gesamte Breite.
4. **Aktivität** — Income-Verlauf und Top-Symbole nebeneinander.

Das Layout ist responsiv. Die zweispaltigen Bereiche werden auf schmalen Bildschirmen untereinander angeordnet; die Bereiche mit voller Breite bleiben erreichbar.

## Live-Aktualisierung

Die Seite verbindet sich mit dem Live-Update-Kanal des Dashboards. Balance und Positionen verwenden zusätzlich ihre bestehenden Live-Abfragen. Bei einer Aktualisierung wird nur das betroffene Widget ersetzt; die Seite wird nicht neu geladen und die Scrollposition wird nicht zurückgesetzt.

Im Kopf der Übersicht gibt es gemeinsame **Benutzer**-, **Zeitraum**- und **Modus**-Steuerungen. Benutzer und Zeitraum werden auf alle Widgets angewendet, die diese Filter unterstützen; der Diagrammmodus gilt gleichzeitig für die PnL- und ADG-Diagramme. Die Steuerungen ändern die angezeigten Daten, nicht das feste Seitenlayout.

## Festes Verhalten

Die Seite bietet nicht mehr **Neues Dashboard**, Dashboard-Auswahl, eigene Layout-Bearbeitung, Löschen oder Vorlagenverwaltung. Die feste Übersicht ist die einzige Dashboard-Darstellung und speichert keine benutzerdefinierte Dashboard-Konfiguration.

Verwenden Sie **Guide** in der Seitennavigation für dieses Thema. Eine Browser-Aktualisierung ist sicher und führt zur gleichen Dashboard-Seite zurück. Hauptnavigation, lokale Skripte und Hilfeabrufe behalten den Anwendungspfad bei. Guide öffnet sich über der aktuellen Seite, ohne sie zu ersetzen.

## PnL-Werte

Tages-PnL zeigt Gewinne grün und Verluste rot. Fehlende oder ungültige Werte sind Lücken ohne Wertbeschriftung, nicht null. Echte Nullwerte zeigen `0.00` an der Grundlinie. Der kumulative Modus summiert verfügbare gültige Tage und setzt nach einer Lücke fort; er behauptet keine vollständige Historie. Nach einem Überlauf bleiben spätere kumulative Werte nicht verfügbar, während gültige Tageswerte sichtbar bleiben.

Diese Fälle nur mit synthetischen API-Antworten in einem isolierten Testserver prüfen, niemals durch Änderungen an Kontohistorien oder echte Trades. Balken-/Linienwechsel und automatische Updates müssen Zeitraum, Benutzer und Zoom erhalten.

## Positionen und Diagrammfenster

**Manage** öffnet einen verschiebbaren und skalierbaren Positionsdialog. Escape schließt zuerst die aktive Config-Vorschau und stellt den Fokus auf ihren Auslöser zurück; beim Schließen von Manage kehrt der Fokus zum ursprünglichen Auslöser zurück. Tab und Shift+Tab bleiben im aktiven Dialog. Außenklicks schließen ihn nicht. Updates erhalten Auswahl, Tabs, Scrollposition und Änderungen.

Orders-Diagramme halten Platz für Entry- und Price-Beschriftungen frei. Automatische Updates erhalten manuelles Verschieben und Zoomen, statt das Diagramm wiederholt neu einzupassen.

## Exchange-Einschränkungen

- Bitunix- und WEEX-PB8-Konten nutzen PB8s Read-only-Clients in begrenzten, isolierten Prozessen für Kontosnapshots. Bitunix-Performance umfasst aus Fills berechnetes realisiertes PnL und Gebühren, nicht vollständiges Funding-Income. Direktes **Market close** bleibt bis zur separaten Prüfung des Exchange-Vertrags deaktiviert. Panic, Graceful Stop und Take Profit Only ändern stattdessen die Bot-Konfiguration.
- Bitget-UTA-Perpetual-Balance ist das USDT-Wallet-Guthaben, nicht Multi-Asset-Equity. Private WebSockets bleiben in dieser Einführung für Classic und UTA deaktiviert; Chart-Positionen und Orders verwenden alle fünf Sekunden vollständige REST-Snapshots. Andere Ansichten hängen von PBData-Polling ab. Direktes **Market close** ist für UTA deaktiviert; verifiziertes Classic bleibt unterstützt, ein unbekannter Kontomodus blockiert die Aktion.
