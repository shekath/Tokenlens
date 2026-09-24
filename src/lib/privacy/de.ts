import type { PolicyText } from './types.ts';

export const de: PolicyText = {
  locale: 'de-DE',
  label: 'Deutsch',
  dir: 'ltr',
  ui: {
    eyebrow: 'Rechtliches',
    title: 'Datenschutzerklärung',
    lede: 'Was TokenTicks erhebt, warum, wer uns bei der Verarbeitung hilft, wie lange wir es aufbewahren und welche Rechte Sie haben, wo immer Sie leben.',
    effective: 'Gültig ab {{effective}}',
    language: 'Sprache',
    onThisPage: 'Auf dieser Seite',
    translationNote: 'Diese Erklärung wird in mehreren Sprachen veröffentlicht. Weicht eine Übersetzung vom englischen Text ab, ist der englische Text maßgeblich.',
    grievanceFallback: 'der Beschwerdebeauftragte von TokenTicks',
    addressFallback: 'auf Anfrage per E-Mail erhältlich',
    emailFallback: 'das Formular „Support kontaktieren“ in Ihrem Konto',
    back: 'Zurück zum Dashboard',
  },
  sections: [
    {
      id: 'summary',
      title: 'Zusammenfassung',
      blocks: [
        'TokenTicks zählt die Tokens in KI-Prompts und schätzt ihre Kosten für verschiedene Modelle. Die Texte, die Sie einfügen, werden in Ihrem eigenen Browser verarbeitet und nie an uns gesendet.',
        'Wir erheben nur, was ein Konto benötigt: Ihre E-Mail-Adresse, Profilangaben, die Sie freiwillig hinzufügen, Ihren Tarif und Abrechnungsstatus sowie das, was Sie speichern. Wir setzen keine Werbe- oder Analyse-Tracker ein und verkaufen oder teilen keine personenbezogenen Daten.',
        'Diese Erklärung beschreibt, was wir erheben, warum, wer uns bei der Verarbeitung hilft, wie lange wir es aufbewahren und welche Rechte Sie nach dem Recht Indiens, der Europäischen Union und des Vereinigten Königreichs, der Vereinigten Staaten und anderer Länder haben.',
      ],
    },
    {
      id: 'who',
      title: 'Wer wir sind',
      blocks: [
        'TokenTicks („wir“, „uns“) wird von {{operator}} aus Indien betrieben. Nach dem indischen Digital Personal Data Protection Act 2023 sind wir der Data Fiduciary und nach der Datenschutz-Grundverordnung der EU und des Vereinigten Königreichs der Verantwortliche für die in dieser Erklärung beschriebenen personenbezogenen Daten.',
        'Bei Fragen oder Anliegen zu Ihren Daten schreiben Sie an {{email}}. Für Beschwerden siehe „Beschwerdebeauftragter und Kontakt“ am Ende dieser Erklärung.',
      ],
    },
    {
      id: 'collect',
      title: 'Welche Daten wir erheben',
      blocks: [
        {
          list: [
            'Konto: Ihre E-Mail-Adresse und Ihr Passwort. Passwörter speichert unser Authentifizierungsanbieter als gesalzenen Hash, den niemand – auch wir nicht – lesen kann. Wenn Sie sich mit Google anmelden, erhalten wir Ihren Namen, Ihre E-Mail-Adresse und Ihre Google-Konto-Kennung.',
            'Freiwillige Profilangaben: vollständiger Name, Anzeigename, Telefonnummer und Land.',
            'Kontoreferenz: eine von uns erzeugte Kennung TT-XXXXX-XXXXX, mit der der Support Ihr Konto findet, ohne nach persönlichen Angaben zu fragen.',
            'Tarif und Abrechnung: Ihr Tarif, Abonnementstatus und Verlängerungsdatum, Kunden- und Abonnement-Kennungen bei Lemon Squeezy, der zuletzt berechnete Betrag und seine Währung sowie Kartenmarke und die letzten vier Ziffern Ihrer Karte. Vollständige Kartennummern verarbeitet ausschließlich Lemon Squeezy; sie erreichen uns nie.',
            'Gespeicherte Schätzungen: Projekttitel, Modell, Token-Anzahlen, Kostenangaben und Annahmen sowie – nur wenn Sie sie behalten – eine Vorschau von bis zu 280 Zeichen des Prompts. Freigabelinks, die Sie erstellen.',
            'Supportanfragen: Betreff und Nachricht, die Sie senden, mit dem technischen Kontext, der Ihnen vor dem Senden angezeigt wird (App-Version, Browser und Bildschirmgröße).',
            'Kommandozeilen- und MCP-Schlüssel: die Bezeichnung, die Sie jedem Schlüssel geben, ein SHA-256-Hash des Schlüssels (nie der Schlüssel selbst), seine ersten Zeichen und der Zeitpunkt der letzten Nutzung.',
            'Technische Daten: Unsere Hosting- und Datenbankanbieter protokollieren IP-Adressen und Anfragen, um den Dienst zu betreiben und abzusichern.',
          ],
        },
      ],
    },
    {
      id: 'notcollect',
      title: 'Was wir nicht erheben',
      blocks: [
        {
          list: [
            'Den Text Ihrer Prompts, abgesehen von der optionalen Vorschau von 280 Zeichen bei einer gespeicherten Schätzung. Zählung und Preisberechnung finden in Ihrem Browser statt; das Kommandozeilenwerkzeug tokenticks und der MCP-Server laufen auf Ihrem eigenen Rechner.',
            'Datensätze, die Sie in „Batch“ laden, und Nutzungsexporte, die Sie in „Reconcile“ laden. Sie werden in Ihrem Browser gelesen und nie hochgeladen.',
            'Analyse-, Werbe- oder seitenübergreifende Tracking-Daten. Die App lädt keine Tracker von Dritten.',
          ],
        },
      ],
    },
    {
      id: 'use',
      title: 'Wofür wir Daten verwenden und Rechtsgrundlagen',
      blocks: [
        {
          list: [
            'Zur Bereitstellung des Dienstes: Ihr Konto anlegen und schützen, Ihre Schätzungen und Freigabelinks speichern und Ihren Tarif anwenden.',
            'Zur Zahlungsabwicklung und Verwaltung von Abonnements über Lemon Squeezy.',
            'Zur Beantwortung von Supportanfragen.',
            'Zur Prüfung der Lizenzschlüssel, die das Kommandozeilenwerkzeug und der MCP-Server verwenden.',
            'Zur Sicherheit des Dienstes und zur Verhinderung von Betrug und Missbrauch.',
            'Zum Versand von Servicenachrichten, etwa Anmeldelinks und Antworten auf Ihre Anfragen. Werbe-E-Mails senden wir nur mit Ihrer Einwilligung.',
          ],
        },
        'Nach dem indischen Digital Personal Data Protection Act 2023 verarbeiten wir personenbezogene Daten auf Grundlage der Einwilligung, die Sie bei der Kontoerstellung erteilen, sowie für die vom Gesetz zugelassenen legitimen Zwecke, etwa freiwillig für einen Zweck bereitgestellte Daten und die Erfüllung gesetzlicher Pflichten. Nach der DSGVO stützen wir uns auf die Erfüllung unseres Vertrags mit Ihnen (Art. 6 Abs. 1 lit. b), unser berechtigtes Interesse an einem sicheren und besseren Dienst (lit. f), Ihre Einwilligung, wo wir sie einholen (lit. a), und rechtliche Pflichten wie steuerliche Aufbewahrung (lit. c).',
        'Wir treffen keine ausschließlich automatisierten Entscheidungen über Sie, die rechtliche oder ähnlich erhebliche Wirkung haben, und wir erstellen keine Profile.',
      ],
    },
    {
      id: 'providers',
      title: 'Dienstleister, die wir einsetzen',
      blocks: [
        'Diese Dienstleister verarbeiten personenbezogene Daten in unserem Auftrag, nur nach unseren Weisungen und gemäß ihren Auftragsverarbeitungsbedingungen. Lemon Squeezy ist Händler (Merchant of Record) für Zahlungen und verarbeitet Zahlungsdaten als eigenständiger Verantwortlicher nach seiner eigenen Datenschutzerklärung.',
        {
          table: {
            head: ['Anbieter', 'Zweck', 'Standort'],
            rows: [
              ['Supabase', 'Datenbank, Anmeldung und Serverfunktionen', 'Südkorea (Seoul)'],
              ['Lemon Squeezy', 'Zahlungen, Steuern, Rechnungen und Abonnements (Merchant of Record)', 'Vereinigte Staaten'],
              ['Resend', 'Zustellung von Benachrichtigungen zu Supportanfragen', 'Vereinigte Staaten'],
              ['Zoho Desk', 'Bearbeitung von Supportgesprächen', 'Zoho-Rechenzentrum unseres Kontos'],
              ['Google', 'Anmeldung mit Google, nur wenn Sie sie nutzen', 'Weltweit'],
              ['GitHub und npm', 'Hosting dieser Website; Verteilung des Kommandozeilenwerkzeugs', 'Vereinigte Staaten'],
            ],
          },
        },
      ],
    },
    {
      id: 'transfers',
      title: 'Internationale Übermittlungen',
      blocks: [
        'Ihre Kontodaten werden in Südkorea gespeichert, und einige Anbieter sitzen in den Vereinigten Staaten. Personenbezogene Daten können daher außerhalb Ihres Wohnsitzlandes verarbeitet werden.',
        'Für Indien sind solche Übermittlungen nach Section 16 des Digital Personal Data Protection Act 2023 zulässig, außer in Länder, die die indische Regierung beschränkt. Für den Europäischen Wirtschaftsraum und das Vereinigte Königreich ist für Südkorea ein angemessenes Schutzniveau anerkannt; Übermittlungen in die Vereinigten Staaten stützen sich auf das EU-US Data Privacy Framework, sofern der Anbieter zertifiziert ist, oder auf Standardvertragsklauseln und das UK Addendum.',
      ],
    },
    {
      id: 'retention',
      title: 'Wie lange wir Daten aufbewahren',
      blocks: [
        {
          list: [
            'Konto, Profil, gespeicherte Schätzungen, Freigabelinks, Schlüssel und bei uns gespeicherte Supportanfragen: bis Sie Ihr Konto löschen.',
            'Abrechnung: Lemon Squeezy bewahrt Rechnungen und Steuerunterlagen so lange auf, wie das Gesetz es verlangt. Unsere eigene Kopie der Abrechnungsereignisse wird mit Ihrem Konto gelöscht.',
            'Supportgespräche in unserem Helpdesk: so lange, wie es zur Klärung der Anfrage und zur Erfüllung gesetzlicher Pflichten nötig ist; danach werden sie gelöscht.',
            'Backups und Protokolle: Sie laufen automatisch nach den Fristen unserer Anbieter ab.',
          ],
        },
        'Sie können Ihr Konto jederzeit über das Profilmenü löschen („Konto löschen“). Dadurch werden Ihr Konto und die oben genannten Daten sofort entfernt und ein aktives Abonnement gekündigt.',
      ],
    },
    {
      id: 'security',
      title: 'Wie wir Daten schützen',
      blocks: [
        'Der gesamte Datenverkehr ist bei der Übertragung verschlüsselt. Die Datenbank erzwingt Sicherheit auf Zeilenebene, sodass jedes Konto nur auf seine eigenen Datensätze zugreifen kann. Lizenzschlüssel werden nur als Hash gespeichert, und Zahlungskarten berühren unsere Systeme nie.',
        'Betrifft Sie eine Verletzung des Schutzes personenbezogener Daten, informieren wir Sie und melden sie den gesetzlich vorgesehenen Behörden, darunter dem Data Protection Board of India und gegebenenfalls den Aufsichtsbehörden der EU und des Vereinigten Königreichs.',
      ],
    },
    {
      id: 'terms',
      title: 'Nutzung von TokenTicks: Konten, Tarife und Verfügbarkeit',
      blocks: [
        {
          list: [
            'Zustimmung. Mit der Erstellung eines Kontos – per E-Mail und Passwort, Magic Link oder Google – akzeptieren Sie diese Erklärung und diese Bedingungen. Wenn Sie nicht einverstanden sind, legen Sie bitte kein Konto an; der Token-Zähler funktioniert auch ohne.',
            'Verhalten und Sperrung. Wir können ein Konto sperren oder schließen, das missbräuchlich genutzt wird, etwa für Betrug, Missbrauch des Dienstes oder seines Zahlungssystems, Versuche, seine Sicherheit zu umgehen, die Weitergabe von Lizenzschlüsseln über den vorgesehenen Zweck hinaus oder rechtswidrige Tätigkeiten. Soweit angemessen, nennen wir Ihnen den Grund und geben Ihnen Gelegenheit zur Stellungnahme. Eine Sperrung berührt Ihre Datenschutzrechte nicht.',
            'Preise und Tarife. Preise, Tarife und die enthaltenen Funktionen können sich ändern, vorbehaltlich Bedingungen wie Änderungen unserer Kosten, der Steuern oder der Preise von KI-Anbietern. Wir kündigen eine Preisänderung mit angemessener Frist an, bevor sie für Ihre nächste Verlängerung gilt, und Sie können vorher kündigen.',
            'Erstattungen. Zahlungen für Tarife werden nicht erstattet, auch nicht für angebrochene Abrechnungszeiträume, es sei denn, das Recht Ihres Landes schreibt eine Erstattung vor. Wenn Sie kündigen, läuft Ihr Tarif bis zum Ende des bereits bezahlten Zeitraums weiter. Zahlungen wickelt Lemon Squeezy als Merchant of Record ab.',
            'Verfügbarkeit. Wir bemühen uns, TokenTicks verfügbar zu halten, doch der Dienst kann durch Ereignisse außerhalb unseres zumutbaren Einflusses vorübergehend eingeschränkt oder unterbrochen werden, etwa Naturkatastrophen, Pandemien, Krieg, Unruhen, behördliche Maßnahmen, Sanktionen, Internet- oder Stromausfälle oder Störungen bei Anbietern, auf die wir angewiesen sind. Für dadurch verursachte Verzögerungen oder Unterbrechungen haften wir nicht und stellen den Dienst so bald wie zumutbar möglich wieder her.',
            'Schätzungen. Token-Anzahlen und Kosten sind Planungsschätzungen. Prüfen Sie die Preise des jeweiligen Anbieters, bevor Sie ein Budget festlegen.',
            'Anwendbares Recht. Diese Bedingungen unterliegen indischem Recht. Schutzrechte, die Ihnen zwingende Verbraucher- oder Datenschutzgesetze Ihres Wohnsitzlandes gewähren, bleiben unberührt.',
          ],
        },
      ],
    },
    {
      id: 'rights-india',
      title: 'Ihre Rechte in Indien',
      blocks: [
        'Nach dem Digital Personal Data Protection Act 2023 und den zugehörigen Rules haben Sie das Recht,',
        {
          list: [
            'eine Zusammenfassung der über Sie verarbeiteten personenbezogenen Daten und unserer Verarbeitung sowie die Identität der Empfänger zu erhalten;',
            'Ihre personenbezogenen Daten berichtigen, vervollständigen, aktualisieren oder löschen zu lassen;',
            'Ihre Einwilligung jederzeit so einfach zu widerrufen, wie Sie sie erteilt haben – durch Löschen Ihres Kontos oder eine Nachricht an uns;',
            'Ihre Beschwerden innerhalb der in den Rules vorgesehenen Frist von unserem Beschwerdebeauftragten bearbeiten zu lassen;',
            'eine andere Person zu benennen, die Ihre Rechte im Todesfall oder bei Handlungsunfähigkeit ausübt.',
          ],
        },
        'Sind Sie mit unserer Antwort nicht zufrieden, können Sie sich beim Data Protection Board of India beschweren. Wir beachten außerdem den Information Technology Act 2000 und seine Regeln zu angemessenen Sicherheitspraktiken. Wie das Gesetz verlangt, machen Sie bitte zutreffende Angaben und reichen Sie keine falschen oder mutwilligen Beschwerden ein.',
      ],
    },
    {
      id: 'rights-eu',
      title: 'Ihre Rechte im Europäischen Wirtschaftsraum und im Vereinigten Königreich',
      blocks: [
        'Nach der DSGVO und der UK GDPR haben Sie das Recht auf Auskunft über Ihre personenbezogenen Daten, auf Berichtigung, auf Löschung, auf Einschränkung der Verarbeitung, auf Widerspruch, auf Datenübertragbarkeit und darauf, eine Einwilligung jederzeit zu widerrufen. Sie haben außerdem das Recht, keiner ausschließlich automatisierten Entscheidung unterworfen zu werden.',
        'Wir beantworten Anfragen innerhalb eines Monats. Sie können sich bei der Datenschutzaufsichtsbehörde Ihres Wohn- oder Arbeitsortes beschweren – im Vereinigten Königreich beim Information Commissioner\'s Office.',
      ],
    },
    {
      id: 'rights-us',
      title: 'Ihre Rechte in den Vereinigten Staaten',
      blocks: [
        'Wenn Sie in Kalifornien (nach dem CCPA in der Fassung des CPRA) oder in einem anderen US-Bundesstaat mit einem Verbraucherdatenschutzgesetz leben, etwa Virginia, Colorado, Connecticut, Utah oder Texas, haben Sie das Recht zu erfahren, welche personenbezogenen Informationen wir erheben und wie wir sie verwenden, auf sie zuzugreifen, sie zu berichtigen und zu löschen, und wegen der Ausübung dieser Rechte nicht benachteiligt zu werden.',
        'In den letzten 12 Monaten haben wir Kennungen (etwa Name und E-Mail), kommerzielle Informationen (Tarif und Abrechnungsstatus) und begrenzte Internetaktivität (Anfrageprotokolle) erhoben. Wir verkaufen oder teilen keine personenbezogenen Informationen für kontextübergreifende verhaltensbasierte Werbung und verwenden keine sensiblen Informationen, um Rückschlüsse auf Ihre Eigenschaften zu ziehen. Es gibt daher nichts, dem Sie widersprechen müssten; Global-Privacy-Control-Signale beachten wir trotzdem. Ein bevollmächtigter Vertreter kann eine Anfrage für Sie stellen.',
      ],
    },
    {
      id: 'rights-other',
      title: 'Ihre Rechte in anderen Ländern',
      blocks: [
        {
          list: [
            'Brasilien (LGPD): die Rechte aus Artikel 18, darunter Bestätigung, Auskunft, Berichtigung, Anonymisierung, Übertragbarkeit und Löschung; Beschwerden an die ANPD.',
            'Kanada (PIPEDA und Provinzgesetze): Auskunft und Berichtigung; Beschwerden an das Office of the Privacy Commissioner of Canada.',
            'Australien (Privacy Act 1988): Auskunft und Berichtigung nach den Australian Privacy Principles; Beschwerden an das OAIC.',
            'Singapur (PDPA), Japan (APPI), Südkorea (PIPA) und andere: die Auskunfts-, Berichtigungs- und Löschrechte, die Ihnen Ihr lokales Recht gewährt.',
          ],
        },
        'Wo immer Sie leben, können Sie unter {{email}} Auskunft, Berichtigung oder Löschung Ihrer Daten verlangen; wir antworten im Einklang mit Ihrem lokalen Recht.',
      ],
    },
    {
      id: 'storage',
      title: 'Cookies und lokaler Speicher',
      blocks: [
        'Wir verwenden keine Werbe- oder Analyse-Cookies. Die App legt einige Einträge im lokalen Speicher Ihres Browsers ab, damit sie so funktioniert, wie Sie sie verlassen haben: Ihren Prompt-Entwurf, das gewählte Modell und den Vergleich, Ihre Kostenannahmen, Ihr Farbschema, die Sprache dieser Seite und, wenn Sie angemeldet sind, Ihre Anmeldesitzung.',
        'Diese Einträge bleiben auf Ihrem Gerät und sind für die von Ihnen genutzten Funktionen unbedingt erforderlich; ein Einwilligungsbanner ist daher nicht nötig. Sie können sie jederzeit in den Einstellungen Ihres Browsers löschen.',
      ],
    },
    {
      id: 'children',
      title: 'Kinder',
      blocks: [
        'TokenTicks richtet sich nicht an Personen unter 18 Jahren. Wir verarbeiten nicht wissentlich personenbezogene Daten von Kindern; das indische Recht verlangt für Personen unter 18 Jahren eine nachprüfbare Einwilligung der Eltern. Wenn Sie glauben, dass ein Kind ein Konto angelegt hat, kontaktieren Sie uns, und wir löschen es.',
      ],
    },
    {
      id: 'changes',
      title: 'Änderungen dieser Erklärung',
      blocks: [
        'Wenn wir diese Erklärung ändern, aktualisieren wir das Gültigkeitsdatum oben. Bei wesentlichen Änderungen informieren wir Sie vor deren Inkrafttreten per E-Mail oder in der App. Frühere Fassungen sind auf Anfrage erhältlich.',
      ],
    },
    {
      id: 'contact',
      title: 'Beschwerdebeauftragter und Kontakt',
      blocks: [
        'Beschwerdebeauftragter und Datenschutzkontakt: {{grievance}}, {{email}}.',
        'Postanschrift: {{address}}.',
        'Wir bestätigen Anfragen umgehend und antworten innerhalb eines Monats oder früher, wenn Ihr lokales Recht es verlangt. Sind Sie nicht zufrieden, können Sie sich beim Data Protection Board of India oder bei der Datenschutzbehörde Ihres Wohnsitzlandes beschweren.',
      ],
    },
  ],
};
