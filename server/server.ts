import net from 'node:net';
import { parse } from './multipart'

type ParseResult = 
    | { success: true; data: unknown }
    | { success: false; status: number; message: string }

const ok = (data: unknown): ParseResult => ({ success: true, data })
const fail = (status: number, message: string): ParseResult => ({ success: false, status, message })

const parseFormUrlEncoded = (body: Buffer) => {
    try {
        const bodyData: Record<string, string> = {}
        const entries = body.toString().split('&')
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

const parseJSON = (body: Buffer) => {
    try {
        return ok(JSON.parse(body.toString()))
    } catch (err) {
        if (err instanceof SyntaxError) {
            return fail(400, err.message)
        }
        return fail(500, 'Internal server error')
    }
}


const parseBody = (contentTypeHeader: string, body: Buffer): ParseResult => {
    const contentType = contentTypeHeader.split(';')[0].trim()
    const parser = bodyParsers[contentType];
    if (!parser) return fail(400, 'Unsupported Content-Type');
    return parser(body, contentTypeHeader);
}

const getBoundary = (contentTypeHeader: string) => {
    const parts = contentTypeHeader.split(';').map(item => item.trim())
    const boundaryPrefix = 'boundary='
    let boundary = parts.find(item => item.startsWith(boundaryPrefix))
    if (!boundary) return null
    boundary = boundary.slice(boundaryPrefix.length).replace(/^"|"$/g, '').trim()
    return boundary || null
}

const bodyParsers: Record<string, (body: Buffer, contentTypeHeader?: string) => ParseResult> = {
    'application/json': (body: Buffer) => parseJSON(body),
    'application/x-www-form-urlencoded': (body: Buffer) => parseFormUrlEncoded(body),
    'text/plain': (body: Buffer) => ok(body),
    'multipart/form-data': (body: Buffer, contentTypeHeader: string | undefined) => {
    if (!contentTypeHeader) return fail(400, 'Missing Content Type Header');
    const boundary = getBoundary(contentTypeHeader);
    if (!boundary) return fail(400, 'Missing Boundary');
    const parts = parse(body, boundary);
    return ok(parts);
}
}

const sendError = (socket: net.Socket, status: number, message: string) => {
    const response = [
        `HTTP/1.1 ${status}`,
        'Content-Type: text/plain',
        `Content-Length: ${Buffer.byteLength(message)}`,
        'Connection: close',
        '',
        message
    ].join('\r\n');
    socket.write(response);
    socket.end();
}

const processRequest = (socket: net.Socket, requestBuffer: Buffer) => {

    const separatorIdx = requestBuffer.indexOf('\r\n\r\n');
    const headerSection = requestBuffer.subarray(0, separatorIdx).toString();
    const headerLines = headerSection.split('\r\n');
    const [method, path, httpVersion] = headerLines[0].split(' ');

    const headers: Record<string, string> = {};
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

    const contentTypeHeader = hasBody ? headers['content-type'] : null;

    if (contentTypeHeader) {
        const body = requestBuffer.subarray(separatorIdx + 4);
        const res = parseBody(contentTypeHeader, body);
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
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);

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

        processRequest(socket, requestBuffer);
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