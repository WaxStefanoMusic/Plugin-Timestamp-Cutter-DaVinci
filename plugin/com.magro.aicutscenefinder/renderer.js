const $ = (id) => document.getElementById(id);

const state = {
    timeline: null,
};

function log(msg) {
    const el = $('log');
    el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
}

function fmtTime(sec) {
    if (!isFinite(sec)) return '--:--';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec - Math.floor(sec)) * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return h > 0
        ? `${h}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
        : `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

async function reloadTimeline() {
    $('timeline-info').textContent = 'Carico...';
    log('Leggo timeline corrente...');
    const res = await window.plugin.readTimeline();
    if (res.error) {
        $('timeline-info').textContent = `ERRORE: ${res.error}`;
        state.timeline = null;
        log(`ERRORE: ${res.error}`);
        $('btn-build').disabled = true;
        renderTable();
        return;
    }

    state.timeline = res;
    const totalDur = res.clips.reduce((a, c) => Math.max(a, c.timeline_start_seconds + c.duration_seconds), 0);
    $('timeline-info').textContent =
        `${res.timelineName}  ·  ${res.clips.length} clip  ·  ${fmtTime(totalDur)}  ·  ${res.fps.toFixed(2)} fps`;

    const auto = `${res.timelineName} - Filmati`;
    const nameInput = $('input-new-timeline-name');
    if (!nameInput.value) nameInput.value = auto;
    else if (nameInput.placeholder === '(auto)') nameInput.placeholder = auto;

    let usable = 0;
    let totalFilmati = 0;
    for (const c of res.clips) {
        if (c.parsed && c.parsed.filmati.length > 0) {
            usable++;
            totalFilmati += c.parsed.filmati.length;
        }
    }
    log(`Timeline: ${res.clips.length} clip, ${usable} con .txt valido, ${totalFilmati} filmati totali.`);

    renderTable();
    $('btn-build').disabled = totalFilmati === 0;
}

function renderTable() {
    const tbody = $('clips-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (!state.timeline) return;

    state.timeline.clips.forEach((c, i) => {
        const tr = document.createElement('tr');
        let statusHtml, detailHtml;

        if (c.parsed) {
            const hasNotes = c.parsed.notes && c.parsed.notes.length > 0;
            statusHtml = hasNotes
                ? `<span class="warn" title="${c.parsed.notes.join(' / ').replace(/"/g,'&quot;')}">OK*</span>`
                : `<span class="ok">OK</span>`;
            const parts = c.parsed.filmati.map((f, idx) => {
                const relStart = f.start - (c.parsed.recStart || 0);
                const relEnd = f.end - (c.parsed.recStart || 0);
                const dur = f.end - f.start;
                return `<div class="film-row" data-clip="${i}" data-film="${idx}" data-src="${relStart}">
                    <b>F${f.index}</b>: ${fmtTime(f.start)} → ${fmtTime(f.end)} <span class="dim">(${fmtTime(dur)})</span>
                </div>`;
            }).join('');
            const notesHtml = hasNotes
                ? `<div class="note-row">⚠ ${c.parsed.notes.join(' · ')}</div>`
                : '';
            detailHtml = notesHtml + parts;
        } else if (c.txtFound) {
            statusHtml = `<span class="err" title="${(c.txtError || '').replace(/"/g,'&quot;')}">ERRORE</span>`;
            detailHtml = `<span class="err">${c.txtError || 'Parse fallito'}</span>`;
        } else {
            statusHtml = `<span class="miss">MANCA</span>`;
            detailHtml = `<span class="miss">${c.txtPath}</span>`;
        }

        tr.innerHTML = `
            <td>${i + 1}</td>
            <td><span class="file-name" title="${c.path}">${c.fileName}</span></td>
            <td>${fmtTime(c.duration_seconds)}</td>
            <td>${statusHtml}</td>
            <td class="count">${c.parsed ? c.parsed.filmati.length : '—'}</td>
            <td class="films-cell">${detailHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // Click handlers on individual filmato rows: seek playhead to the
    // start of that filmato (in the ORIGINAL timeline coordinates).
    tbody.querySelectorAll('.film-row').forEach(el => {
        el.addEventListener('click', async () => {
            const clipIdx = parseInt(el.dataset.clip, 10);
            const filmIdx = parseInt(el.dataset.film, 10);
            const clip = state.timeline.clips[clipIdx];
            const film = clip.parsed.filmati[filmIdx];
            const srcStart = film.start - (clip.parsed.recStart || 0);
            const timelineSec = clip.timeline_start_seconds + (srcStart - clip.in_seconds);
            const res = await window.plugin.seekTimeline(timelineSec);
            if (res.error) log('Seek errore: ' + res.error);
            else log(`Salto a ${res.timecode} (Filmato ${film.index} di ${clip.fileName})`);
        });
    });
}

async function buildFilmati() {
    if (!state.timeline) return;
    const newName = ($('input-new-timeline-name').value || '').trim()
        || `${state.timeline.timelineName} - Filmati`;

    $('btn-build').disabled = true;
    $('build-status').textContent = `Creazione "${newName}" in corso...`;
    log(`=== Crea timeline "${newName}" ===`);

    const res = await window.plugin.buildFilmati({
        clips: state.timeline.clips,
        fps: state.timeline.fps,
        newTimelineName: newName,
    });

    $('btn-build').disabled = false;

    if (res.error) {
        $('build-status').textContent = 'Errore: ' + res.error;
        log('BUILD FALLITO: ' + res.error);
        return;
    }

    $('build-status').textContent =
        `Creata "${res.newTimelineName}"  ·  ${res.filmatiCount} filmati  ·  ${res.markersAdded} marker`;
    log(`Timeline creata. Filmati: ${res.filmatiCount}, Marker: ${res.markersAdded}`);
}

$('btn-reload').addEventListener('click', reloadTimeline);
$('btn-build').addEventListener('click', buildFilmati);

// ---------- Auto-update modal --------------------------------------------

function showUpdateModal(info) {
    $('update-current').textContent = info.current || '?';
    $('update-latest').textContent = info.version || '?';
    $('update-notes').textContent = (info.notes || '').trim() || 'Nessuna nota fornita.';
    $('update-status').hidden = true;
    $('update-status').textContent = '';
    $('btn-update-now').disabled = false;
    $('btn-update-later').disabled = false;
    $('update-modal').hidden = false;
}

function hideUpdateModal() {
    $('update-modal').hidden = true;
}

$('btn-update-later').addEventListener('click', hideUpdateModal);

$('btn-update-now').addEventListener('click', async () => {
    $('btn-update-now').disabled = true;
    $('btn-update-later').disabled = true;
    $('update-status').hidden = false;
    $('update-status').textContent = 'Download in corso...';
    const res = await window.plugin.update.apply();
    if (res && res.error) {
        $('update-status').textContent = 'Errore: ' + res.error;
        $('btn-update-now').disabled = false;
        $('btn-update-later').disabled = false;
        log('Aggiornamento fallito: ' + res.error);
        return;
    }
    $('update-status').textContent =
        'Installer avviato. Conferma il prompt UAC, attendi il completamento, poi RIAVVIA DaVinci Resolve.';
    log('Installer di aggiornamento avviato. Riavvia Resolve al termine.');
});

window.plugin.update.onAvailable((info) => {
    log(`Aggiornamento disponibile: ${info.current} → ${info.version}`);
    showUpdateModal(info);
});

reloadTimeline();
