// Electron main for Video Timestamp Cutter.
// Reads a .txt file next to each video clip on the timeline, parses HH:MM:SS.mmm
// timestamps, and builds a new timeline containing only the segments between
// each (start, end) filmato pair, with red markers "Inizio filmato N" and
// "Fine filmato N" at each boundary.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn } = require('child_process');

const WorkflowIntegration = require('./WorkflowIntegration.node');

const PLUGIN_ID = 'com.magro.aicutscenefinder';
const UPDATE_OWNER = 'WaxStefanoMusic';
const UPDATE_REPO = 'davinci-timestamp-cutter-releases';
const CURRENT_VERSION = require('./package.json').version;

let mainWindow = null;
let resolveObj = null;
let pendingUpdate = null;

// ---------- Resolve connection --------------------------------------------

async function getResolve() {
    if (resolveObj) return resolveObj;
    const ok = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!ok) return null;
    resolveObj = await WorkflowIntegration.GetResolve();
    return resolveObj;
}

async function getProject() {
    const r = await getResolve();
    if (!r) return null;
    const pm = await r.GetProjectManager();
    if (!pm) return null;
    return await pm.GetCurrentProject();
}

// ---------- Parsing .txt --------------------------------------------------

// Lines whose label matches this pattern are meta-info, not markers.
// Example: "Durata: 00:00:23.946".
const META_LABEL_RE = /\b(durata|duration|lunghezza|length|total|totale)\b/i;

function parseLine(line) {
    // Return { seconds, label } where label is any descriptive text BEFORE
    // the timestamp (colons/@/dashes/whitespace stripped). If the line has
    // no timestamp, returns null.
    const m = line.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d+))?/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mn = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    const ms = m[4] ? parseFloat('0.' + m[4]) : 0;
    const seconds = h * 3600 + mn * 60 + s + ms;
    const prefix = line.substring(0, m.index);
    const label = prefix
        .replace(/[:@\-\s]+$/, '')
        .trim()
        .replace(/\s+/g, ' ');
    return { seconds, label };
}

function parseTxt(content) {
    const lines = content.split(/\r?\n/)
        .map(l => l.replace(/^\s+|\s+$/g, ''))
        .filter(l => l.length > 0 && !l.startsWith('#'));

    const entries = [];  // [{seconds, label}]
    for (const l of lines) {
        const e = parseLine(l);
        if (e === null) return { error: `Timestamp non valido: "${l}"` };
        if (META_LABEL_RE.test(e.label)) continue;
        entries.push(e);
    }

    if (entries.length < 4) {
        return { error: `Servono almeno 4 timestamp (inizio rec + 1 coppia filmato + fine rec). Trovati ${entries.length}.` };
    }

    const recStart = entries[0].seconds;
    const recStartLabel = entries[0].label;
    const recEnd = entries[entries.length - 1].seconds;
    const recEndLabel = entries[entries.length - 1].label;
    const inner = entries.slice(1, -1);

    const notes = [];
    // Detect time-base mismatch: if any inner marker is BEFORE recStart,
    // the marker timestamps are relative to the file while recStart /
    // recEnd are wall-clock header/footer (e.g. "Inizio registrazione:
    // 2026-05-15 23:49:37"). In that case neither header nor footer can
    // be used as offset / implicit fine.
    const minInner = inner.length ? Math.min(...inner.map(e => e.seconds)) : recStart;
    const markersAreFileRelative = minInner < recStart;

    // Odd count: the last inner timestamp has no explicit "fine". Use
    // recEnd as the implicit fine only when it is in the same base.
    if (inner.length % 2 !== 0) {
        const orphan = inner[inner.length - 1];
        if (!markersAreFileRelative && recEnd > orphan.seconds) {
            inner.push({ seconds: recEnd, label: recEndLabel || '' });
        } else {
            inner.pop();
        }
    }

    const filmati = [];
    let nextIndex = 1;
    for (let i = 0; i < inner.length; i += 2) {
        const a = inner[i];
        const b = inner[i + 1];
        if (b.seconds <= a.seconds) {
            notes.push(
                `Filmato ${i / 2 + 1} ignorato: fine (${b.seconds.toFixed(3)}s) ` +
                `<= inizio (${a.seconds.toFixed(3)}s).`
            );
            continue;
        }
        filmati.push({
            index: nextIndex++,
            start: a.seconds,
            end: b.seconds,
            startLabel: a.label,
            endLabel: b.label,
        });
    }

    if (filmati.length === 0) {
        return { error: `Nessun filmato valido trovato (tutti i range erano degenerati).` };
    }

    // recStart (primo timestamp) viene sottratto dai tempi dei filmati per
    // convertirli in tempo relativo al file (utile se i timestamp sono
    // orari assoluti). Ma se un filmato inizia PRIMA di recStart, le due
    // cose non sono nella stessa base: i marcatori sono gia' relativi al
    // file e la riga "Inizio registrazione: <data ora>" e' solo
    // un'informazione, non un offset. In quel caso l'offset va azzerato.
    const effectiveRecStart = markersAreFileRelative ? 0 : recStart;

    return {
        recStart: effectiveRecStart,
        recEnd,
        recStartLabel, recEndLabel,
        filmati,
        notes,
    };
}

function txtPathForVideo(videoPath) {
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath));
    return path.join(dir, base + '.txt');
}

// ---------- Read current timeline + sidecar .txt --------------------------

async function readTimelineWithTxt() {
    const project = await getProject();
    if (!project) return { error: 'Nessun progetto aperto' };

    const timeline = await project.GetCurrentTimeline();
    if (!timeline) return { error: 'Nessuna timeline corrente' };

    const fpsStr = await timeline.GetSetting('timelineFrameRate');
    const fps = parseFloat(fpsStr) || 24;
    const tlStartFrame = parseInt(await timeline.GetStartFrame(), 10) || 0;

    const trackCount = await timeline.GetTrackCount('video');
    if (!trackCount || trackCount < 1) return { error: 'Nessuna traccia video' };

    const items = await timeline.GetItemListInTrack('video', 1);
    if (!items || items.length === 0) return { error: 'V1 vuota' };

    const clips = [];
    for (const item of items) {
        const mpItem = await item.GetMediaPoolItem();
        if (!mpItem) continue;
        const filePath = await mpItem.GetClipProperty('File Path');
        if (!filePath) continue;

        const leftOffset = parseInt(await item.GetLeftOffset(), 10) || 0;
        const duration = parseInt(await item.GetDuration(), 10) || 0;
        const startFrame = parseInt(await item.GetStart(), 10) || 0;

        const txtPath = txtPathForVideo(filePath);
        let parsed = null;
        let txtError = null;
        let txtFound = fs.existsSync(txtPath);
        if (txtFound) {
            try {
                const content = fs.readFileSync(txtPath, 'utf-8');
                const res = parseTxt(content);
                if (res.error) txtError = res.error;
                else parsed = res;
            } catch (e) {
                txtError = `Lettura .txt fallita: ${e.message}`;
            }
        } else {
            txtError = 'File .txt non trovato accanto al video';
        }

        clips.push({
            path: filePath,
            fileName: path.basename(filePath),
            txtPath,
            txtFound,
            txtError,
            parsed,
            in_seconds: leftOffset / fps,
            duration_seconds: duration / fps,
            timeline_start_seconds: (startFrame - tlStartFrame) / fps,
            media_pool_item_id: await mpItem.GetUniqueId(),
        });
    }

    const timelineName = await timeline.GetName();
    return { timelineName, fps, clips };
}

// ---------- Build filmati timeline ----------------------------------------

async function buildMediaPoolIndex() {
    const r = await getResolve();
    const pm = await r.GetProjectManager();
    const project = await pm.GetCurrentProject();
    const mediaPool = await project.GetMediaPool();
    const root = await mediaPool.GetRootFolder();
    const index = {};
    const byPath = {};
    async function walk(folder) {
        const clips = await folder.GetClipList();
        if (clips) for (const c of clips) {
            const id = await c.GetUniqueId();
            if (id) index[id] = c;
            const fp = await c.GetClipProperty('File Path');
            if (fp) byPath[path.normalize(fp).toLowerCase()] = c;
        }
        const subs = await folder.GetSubFolderList();
        if (subs) for (const s of subs) await walk(s);
    }
    await walk(root);
    return { mediaPool, project, index, byPath };
}

async function buildFilmatiTimeline(_event, args) {
    const { clips, fps, newTimelineName } = args;

    const { mediaPool, project, index, byPath } = await buildMediaPoolIndex();

    const appendList = [];
    const markerPlan = [];
    const skipped = [];
    let cumulativeFrames = 0;
    let globalIndex = 1;

    for (const clip of clips) {
        if (!clip.parsed || !clip.parsed.filmati || clip.parsed.filmati.length === 0) {
            skipped.push(`${clip.fileName}: nessun filmato valido nel .txt`);
            continue;
        }
        let mpItem = index[clip.media_pool_item_id];
        if (!mpItem && clip.path) {
            mpItem = byPath[path.normalize(clip.path).toLowerCase()];
        }
        if (!mpItem) {
            skipped.push(`${clip.fileName}: clip non ritrovata nel media pool`);
            continue;
        }
        const recStart = clip.parsed.recStart || 0;

        let addedForClip = 0;
        for (const film of clip.parsed.filmati) {
            // Normalize filmato times to source-file time by subtracting
            // recStart. If txt uses times relative to file start, recStart
            // is 00:00:00 and this is a no-op.
            const srcStart = film.start - recStart;
            const srcEnd = film.end - recStart;
            const startFrame = Math.max(0, Math.round(srcStart * fps));
            const endFrame = Math.round(srcEnd * fps);
            if (endFrame <= startFrame) continue;

            addedForClip++;
            appendList.push({
                mediaPoolItem: mpItem,
                startFrame,
                endFrame,
            });

            const durationFrames = endFrame - startFrame;
            const startName = film.startLabel && film.startLabel.length > 0
                ? film.startLabel
                : `Inizio filmato ${globalIndex}`;
            const endName = film.endLabel && film.endLabel.length > 0
                ? film.endLabel
                : `Fine filmato ${globalIndex}`;
            markerPlan.push({
                frame: cumulativeFrames,
                name: startName,
                note: clip.fileName,
            });
            markerPlan.push({
                frame: Math.max(0, cumulativeFrames + durationFrames - 1),
                name: endName,
                note: clip.fileName,
            });
            cumulativeFrames += durationFrames;
            globalIndex++;
        }

        if (addedForClip === 0) {
            skipped.push(
                `${clip.fileName}: tutti i range degeneri dopo la sottrazione ` +
                `dell'inizio registrazione (recStart=${recStart.toFixed(3)}s). ` +
                `Probabile primo timestamp del .txt errato.`
            );
        }
    }

    if (appendList.length === 0) {
        const why = skipped.length ? '\n- ' + skipped.join('\n- ') : '';
        return { error: 'Nessun filmato da aggiungere (controlla i file .txt)' + why };
    }

    const newTimeline = await mediaPool.CreateEmptyTimeline(newTimelineName);
    if (!newTimeline) return { error: `Impossibile creare timeline "${newTimelineName}" (forse già esiste?)` };

    await project.SetCurrentTimeline(newTimeline);
    const appended = await mediaPool.AppendToTimeline(appendList);
    if (!appended) return { error: 'AppendToTimeline ha fallito' };

    let markersAdded = 0;
    for (const m of markerPlan) {
        const ok = await newTimeline.AddMarker(m.frame, 'Red', m.name, m.note, 1);
        if (ok) markersAdded++;
    }

    return {
        ok: true,
        newTimelineName,
        filmatiCount: appendList.length,
        markersAdded,
        totalFrames: cumulativeFrames,
    };
}

// ---------- Seek helper (jump playhead) -----------------------------------

function secondsToTimecode(sec, fps) {
    const f = Math.max(1, Math.round(fps));
    const total = Math.max(0, Math.round(sec * f));
    const ff = total % f;
    const ss = Math.floor(total / f) % 60;
    const mm = Math.floor(total / (f * 60)) % 60;
    const hh = Math.floor(total / (f * 3600));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

async function seekTimeline(_event, seconds) {
    const project = await getProject();
    if (!project) return { error: 'Nessun progetto' };
    const timeline = await project.GetCurrentTimeline();
    if (!timeline) return { error: 'Nessuna timeline' };
    const fpsStr = await timeline.GetSetting('timelineFrameRate');
    const fps = parseFloat(fpsStr) || 24;
    const tc = secondsToTimecode(seconds, fps);
    const ok = await timeline.SetCurrentTimecode(tc);
    return ok ? { ok: true, timecode: tc } : { error: `SetCurrentTimecode fallito per ${tc}` };
}

// ---------- Auto-update ---------------------------------------------------

function semverGreater(a, b) {
    const pa = String(a).replace(/^v/, '').split(/[.\-]/).map(n => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/, '').split(/[.\-]/).map(n => parseInt(n, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return false;
}

function httpsGet(url, headers, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, resolve);
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    });
}

async function fetchJSON(url) {
    const res = await httpsGet(url, {
        'User-Agent': 'video-timestamp-cutter-updater',
        'Accept': 'application/vnd.github+json',
    });
    return new Promise((resolve, reject) => {
        if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', c => buf += c);
        res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
        res.on('error', reject);
    });
}

async function downloadFile(url, destPath) {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
        const res = await httpsGet(current, { 'User-Agent': 'video-timestamp-cutter-updater' });
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            current = res.headers.location;
            continue;
        }
        if (res.statusCode !== 200) {
            res.resume();
            throw new Error(`HTTP ${res.statusCode}`);
        }
        await new Promise((resolve, reject) => {
            const out = fs.createWriteStream(destPath);
            res.pipe(out);
            out.on('finish', () => out.close(() => resolve()));
            out.on('error', reject);
            res.on('error', reject);
        });
        return;
    }
    throw new Error('too many redirects');
}

async function checkForUpdate() {
    try {
        const rel = await fetchJSON(
            `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`
        );
        const latest = (rel.tag_name || '').replace(/^v/, '');
        if (!latest || !semverGreater(latest, CURRENT_VERSION)) return;
        const asset = (rel.assets || []).find(a => /\.zip$/i.test(a.name));
        if (!asset) return;
        pendingUpdate = {
            version: latest,
            current: CURRENT_VERSION,
            notes: rel.body || '',
            assetUrl: asset.browser_download_url,
            assetName: asset.name,
            htmlUrl: rel.html_url,
        };
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:available', pendingUpdate);
        }
    } catch (_) {
        // Silent: offline, rate limit, or no release yet.
    }
}

function findInstallBat(dir, depth = 0) {
    if (depth > 3) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && e.name.toLowerCase() === 'install.bat') return full;
    }
    for (const e of entries) {
        if (e.isDirectory()) {
            const found = findInstallBat(path.join(dir, e.name), depth + 1);
            if (found) return found;
        }
    }
    return null;
}

async function applyUpdate() {
    if (!pendingUpdate) return { error: 'Nessun aggiornamento in attesa' };
    try {
        const tmp = path.join(os.tmpdir(), `vtcutter-update-${pendingUpdate.version}`);
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        fs.mkdirSync(tmp, { recursive: true });
        const zipPath = path.join(tmp, 'release.zip');
        await downloadFile(pendingUpdate.assetUrl, zipPath);

        const extractDir = path.join(tmp, 'extracted');
        fs.mkdirSync(extractDir, { recursive: true });
        await new Promise((resolve, reject) => {
            const ps = spawn('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-Command',
                `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`
            ], { stdio: 'ignore', windowsHide: true });
            ps.on('exit', code => code === 0 ? resolve() : reject(new Error(`unzip code ${code}`)));
            ps.on('error', reject);
        });

        const installBat = findInstallBat(extractDir);
        if (!installBat) return { error: 'install.bat non trovato nel pacchetto scaricato' };

        spawn('cmd.exe', ['/c', 'start', '""', installBat], {
            detached: true,
            stdio: 'ignore',
            cwd: path.dirname(installBat),
            windowsHide: false,
        }).unref();

        return { ok: true };
    } catch (e) {
        return { error: `Aggiornamento fallito: ${e.message}` };
    }
}

// ---------- IPC + window --------------------------------------------------

function registerIpc() {
    ipcMain.handle('timeline:read', readTimelineWithTxt);
    ipcMain.handle('timeline:build', buildFilmatiTimeline);
    ipcMain.handle('timeline:seek', seekTimeline);
    ipcMain.handle('update:apply', applyUpdate);
    ipcMain.handle('app:version', () => CURRENT_VERSION);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        useContentSize: true,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
        },
    });
    mainWindow.setMenu(null);
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(checkForUpdate, 1500);
    });
}

app.whenReady().then(() => {
    registerIpc();
    createWindow();
});

app.on('window-all-closed', () => {
    try { WorkflowIntegration.CleanUp(); } catch (_) {}
    if (process.platform !== 'darwin') app.quit();
});
