const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('plugin', {
    readTimeline:  ()       => ipcRenderer.invoke('timeline:read'),
    buildFilmati:  (args)   => ipcRenderer.invoke('timeline:build', args),
    seekTimeline:  (sec)    => ipcRenderer.invoke('timeline:seek', sec),
    appVersion:    ()       => ipcRenderer.invoke('app:version'),
    update: {
        onAvailable: (cb)   => ipcRenderer.on('update:available', (_, info) => cb(info)),
        apply:       ()     => ipcRenderer.invoke('update:apply'),
    },
});
