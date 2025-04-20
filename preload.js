const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (...args) => ipcRenderer.send(...args),
        invoke: (...args) => ipcRenderer.invoke(...args),
        on: (...args) => ipcRenderer.on(...args),
    }
});