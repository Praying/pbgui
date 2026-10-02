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

Verwenden Sie **Guide** in der Seitennavigation für dieses Thema. Eine Browser-Aktualisierung ist sicher und führt zur gleichen Dashboard-Seite zurück.
