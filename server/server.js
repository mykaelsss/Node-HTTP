import net from 'node:net';

const ok = (data) => ({ success: true, data })
const fail = (status, message) => ({ success: false, status, message })

const parseFormUrlEncoded = (body) => {
    try {
        const bodyData = {}
        const entries = body.split('&')
        for (const entry of entries) {
            const idx = entry.indexOf('=');
            if (idx === -1) continue;
            const [key, value] = [entry.substring(0,idx), entry.substring(idx+1)];
            if (key) {
                bodyData[decodeURIComponent(key)] = decodeURIComponent(value);
            }
        }
        return ok(bodyData);
    } catch (err) {
        if (err instanceof URIError) {
            return fail(400, err.message)
        }
        return fail(500, 'Internal server error')
    }
}

const parseJSON = (body) => {
    try {
        return ok(JSON.parse(body))
    } catch (err) {
        if (err instanceof SyntaxError) {
            return fail(400, err.message)
        }
        return fail(500, 'Internal server error')
    }
}

const parseBody = (contentType, body) => {
    switch (contentType) {
            case 'application/x-www-form-urlencoded': return parseFormUrlEncoded(body)
            case 'multipart/form-data': {

            }
            case 'application/json': return parseJSON(body);
            case 'text/plain': {

            }
            case 'application/xml': {

            }
            case 'text/xml': {

            }
            case 'application/octet-stream': {

            }
            default: {

            }
        }
}

const getBoundary = (contentType) => {
    const parts = contentType.split(';').map(item => item.trim())
    const boundaryPrefix = 'boundary='
    let boundary = parts.find(item => item.startsWith(boundaryPrefix))
    if (!boundary) return null
    boundary = boundary.slice(boundaryPrefix.length).replace(/^"|"$/g, '').trim()
    return boundary || null
}

const sendError = (socket, status, message) => {
    const response = [
        `HTTP/1.1 ${status}`,
        'Content-Type: text/plain',
        `Content-Length: ${Buffer.byteLength(message)}`,
        'Connection: close',
        '',
        message
    ].join('\r\n')
    socket.write(response)
    socket.end()
}

const processRequest = (socket, requestBuffer) => {
    const separatorIdx = requestBuffer.indexOf('\r\n\r\n');
    const headerSection = requestBuffer.subarray(0, separatorIdx).toString();
    const headerLines = headerSection.split('\r\n');
    const [method, path, httpVersion] = headerLines[0].split(' ');

    const headers = {};
    for (let i = 1; i < headerLines.length; i++) {
        const colonIdx = headerLines[i].indexOf(': ');
        if (colonIdx === -1) continue;
        const key = headerLines[i].substring(0, colonIdx).toLowerCase();
        const value = headerLines[i].substring(colonIdx + 2);
        
        if (key in headers) {
            headers[key] += `,${value}`
        } else {
            headers[key] = value;
        }
    }

    const keepAlive =
        (httpVersion === 'HTTP/1.1' && headers['connection']?.toLowerCase() !== 'close') ||
        (httpVersion === 'HTTP/1.0' && headers['connection']?.toLowerCase() === 'keep-alive');

    const contentLength = parseInt(headers['content-length']) || 0;
    const hasBody = contentLength > 0;
    const hasContentType = !!headers['content-type'];

    if (hasBody && !hasContentType) {
        return sendError(socket, 400, 'Missing Content-Type');
    }

    const contentType = hasBody ? headers['content-type'].split(';')[0].trim() : null;

    if (contentType) {
        const body = requestBuffer.subarray(separatorIdx + 4).toString();
        const res = parseBody(contentType, body);
        if (!res.success) {
            return sendError(socket, res.status, res.message);
        }
    }

    const responseBody = 'success'
    const response = [
        'HTTP/1.1 200 OK',
        'Content-Type: text/plain',
        `Content-Length: ${Buffer.byteLength(responseBody)}`,
        `Connection: ${keepAlive ? 'keep-alive' : 'close'}`,
        '',
        responseBody
    ].join('\r\n')

    socket.write(response)
    if (!keepAlive) socket.end()
}

const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.setTimeout(5000);
    socket.on('timeout', () => socket.end());

    socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
        const separatorIdx = buffer.indexOf('\r\n\r\n');
        if (separatorIdx === -1) return;

        const headerStr = buffer.subarray(0, separatorIdx).toString();
        const contentLengths = [...headerStr.matchAll(/content-length:\s*(\d+)/gi)].map((m) => m[1]);
        const transferEncodings = [...headerStr.matchAll(/transfer-encoding:\s*(\S+)/gi)].map((m) => m[1]);

        if (contentLengths.length && transferEncodings.length) {
            return sendError(socket, 400, 'Content-Length and Transfer-Encoding cannot be passed together.');
        }

        const uniqueLengths = new Set(contentLengths);

        if (uniqueLengths.size > 1) {
            return sendError(socket, 400, 'Duplicate Content-Length headers');
        }

        const contentLength = contentLengths.length ? parseInt(contentLengths[0], 10) : 0;

        if (contentLength < 0) {
            return sendError(socket, 400, 'Invalid Content-Length');
        }

        const totalExpected = separatorIdx + 4 + contentLength;
        if (buffer.length < totalExpected) return;

        const requestBuffer = buffer.subarray(0, totalExpected);
        buffer = buffer.subarray(totalExpected);
        
        socket.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK');
        // processRequest(socket, requestBuffer);
    }
});

    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
        socket.destroy();
    });
})


server.listen('3000', () => {
    console.log("server running on port 3000");
});