// JSON files in the user's SillyTavern data folder (user/files/), through
// SillyTavern's own file API - for what is too big for the extension
// settings: a world's starting points (src/worlds/). The Archivist
// convention:
//
//   write   POST /api/files/upload  { name, data: base64 }  -> user/files/<name>
//   read    GET  /user/files/<name>
//   delete  POST /api/files/delete  { path: "user/files/<name>" }

const FILES_DIR = 'user/files';

// UTF-8 text -> base64, in slices so a large file can't overflow the
// argument limit of String.fromCharCode.
function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

const headers = () => SillyTavern.getContext().getRequestHeaders();

// The JSON in `fileName`, or null when there is no such file. Throws when
// it cannot be read.
export async function readJsonFile(fileName) {
    const response = await fetch(`/${FILES_DIR}/${encodeURIComponent(fileName)}`, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`reading ${fileName} failed (${response.status})`);
    return response.json();
}

export async function writeJsonFile(fileName, data) {
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: fileName, data: toBase64(JSON.stringify(data)) }),
    });
    if (!response.ok) throw new Error(`writing ${fileName} failed (${response.status})`);
}

// A file already gone counts as deleted.
export async function deleteJsonFile(fileName) {
    const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ path: `${FILES_DIR}/${fileName}` }),
    });
    if (!response.ok && response.status !== 404) throw new Error(`deleting ${fileName} failed (${response.status})`);
}

// Hands the browser a file to save.
export function downloadText(fileName, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A name safe to save a file under: no path or reserved characters.
export function safeFileName(name, fallback = 'file') {
    return String(name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
}
