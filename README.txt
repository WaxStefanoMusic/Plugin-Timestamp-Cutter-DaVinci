Video Timestamp Cutter (DaVinci Resolve)
=========================================

Plugin Workflow Integration per DaVinci Resolve Studio.

Data una timeline con video in ordine cronologico e un file .txt sidecar
per ogni video (stessa cartella, stesso nome base), il plugin:

  1. Legge i timestamp dai .txt
  2. Crea una nuova timeline "<NomeOriginale> - Filmati" contenente solo
     i range tra (Inizio filmato N) e (Fine filmato N) concatenati
  3. Aggiunge marker rossi "Inizio filmato N" e "Fine filmato N" sulla
     nuova timeline ai confini di ogni filmato


INSTALLAZIONE (PC nuovo)
------------------------
Requisiti: DaVinci Resolve Studio gia' installato.

1. Copia la cartella (o il pacchetto Distribuzione) dove vuoi sul PC
   (es. Desktop, chiavetta, cartella utente...)
2. Doppio click su install.bat
   (conferma la richiesta UAC -> l'installer si auto-eleva come admin)
3. Al termine, riavvia DaVinci Resolve completamente
4. Menu: Workspace -> Workflow Integrations -> Video Timestamp Cutter

Il plugin e' autocontenuto: niente Python, niente GPU, niente dipendenze.
WorkflowIntegration.node e' gia' dentro la cartella plugin.


DISINSTALLAZIONE
----------------
Doppio click su uninstall.bat.


FORMATO FILE .txt
-----------------
Un file per video, stessa cartella, stesso nome base
(es. 01.mp4 -> 01.txt).

Formato timestamp: HH:MM:SS.mmm (millisecondi opzionali) una per riga.
Righe vuote o che iniziano con # sono ignorate.
Qualsiasi testo descrittivo prima/dopo il timestamp viene ignorato:
il parser estrae solo il primo timestamp da ogni riga.

Esempi validi (funzionano entrambi):

  # con descrizioni
  Inizio registrazione: @ 00:00:00.000
  Inizio filmato 1:     @ 00:01:23.500
  Fine filmato 1:       @ 00:04:15.000
  Inizio filmato 2:     @ 00:12:00.250
  Fine filmato 2:       @ 00:15:30.750
  Fine registrazione:   @ 01:15:42.000

  # minimal
  00:00:00.000
  00:01:23.500
  00:04:15.000
  00:12:00.250
  00:15:30.750
  01:15:42.000

La prima e l'ultima riga sono puramente informative. Le coppie in mezzo
(inizio, fine) definiscono i filmati da estrarre.


USO
---
1. Importa i video nel media pool (nome numerico per ordine: 01.mp4,
   02.mp4, ...) e mettili in ordine sulla V1 della timeline
2. Crea i file .txt accanto a ogni video con i timestamp corretti
3. Apri il plugin: Workspace -> Workflow Integrations
   -> Video Timestamp Cutter
4. La tabella mostra lo stato di ogni clip (.txt trovato? quanti
   filmati?)
5. (Opzionale) Cambia il nome della timeline destinazione
6. Click "Crea timeline filmati"

Click su una riga "F<N>: ..." nel dettaglio dei filmati -> sposta il
playhead di DaVinci a quel filmato nella timeline originale (utile per
verificare prima di creare la timeline nuova).


CREARE UN PACCHETTO PER ALTRO PC
---------------------------------
Lancia "crea_pacchetto_distribuzione.bat" dalla root del progetto.
Genera una cartella "Distribuzione" con solo i file necessari
(plugin + install/uninstall + README). Copia quella su chiavetta o
via rete, lanciala su install.bat sul PC di destinazione.


STRUTTURA
---------
plugin/com.magro.aicutscenefinder/    il plugin vero e proprio
    manifest.xml                       dichiarazione plugin per Resolve
    main.js                            logica Electron + API Resolve
    preload.js                         IPC bridge
    index.html                         UI
    renderer.js                        UI logic
    css/styles.css                     stili UI
    package.json                       metadati
    WorkflowIntegration.node           binding nativo Resolve (bundled)

install.bat                            installer auto-elevating
uninstall.bat                          uninstaller
crea_pacchetto_distribuzione.bat       crea cartella Distribuzione pulita
README.txt                             questo file

_legacy/                               (non rilevante) backup del vecchio
                                       plugin AI-based
