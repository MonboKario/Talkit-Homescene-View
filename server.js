const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const ROOT_DIR_PREFIX = `${ROOT_DIR}${path.sep}`;
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 8000;

const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.wasm': 'application/wasm',
};

function sendText(res, statusCode, message) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(message);
}

function resolveRequestPath(requestUrl) {
    const url = new URL(requestUrl || '/', 'http://localhost');
    const decodedPathname = decodeURIComponent(url.pathname);
    const relativePath = decodedPathname === '/'
        ? 'index.html'
        : decodedPathname.replace(/^\/+/, '');

    const absolutePath = path.normalize(path.join(ROOT_DIR, relativePath));
    if (absolutePath !== ROOT_DIR && !absolutePath.startsWith(ROOT_DIR_PREFIX)) {
        return null;
    }

    return absolutePath;
}

async function getFilePath(requestUrl) {
    const requestedPath = resolveRequestPath(requestUrl);
    if (!requestedPath) return null;

    const stats = await fs.promises.stat(requestedPath);
    if (!stats.isDirectory()) {
        return requestedPath;
    }

    const directoryIndexPath = path.join(requestedPath, 'index.html');
    const normalizedIndexPath = path.normalize(directoryIndexPath);

    if (normalizedIndexPath !== ROOT_DIR && !normalizedIndexPath.startsWith(ROOT_DIR_PREFIX)) {
        return null;
    }

    return normalizedIndexPath;
}

const server = http.createServer(async (req, res) => {
    try {
        const filePath = await getFilePath(req.url);
        if (!filePath) {
            sendText(res, 403, '403: Forbidden');
            return;
        }

        const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendText(res, 404, '404: File Not Found');
            return;
        }

        console.error('Static server error:', error);
        sendText(res, 500, '500: Internal Server Error');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
});
