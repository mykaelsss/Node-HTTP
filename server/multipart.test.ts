import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parse, BufferToString, DemoData } from './multipart';

// ─── helpers ────────────────────────────────────────────────────────────────

function buildMultipart(boundary: string, parts: { headers: string[]; body: string }[]): Buffer {
    const lines: string[] = [];
    for (const part of parts) {
        lines.push(`--${boundary}`);
        for (const h of part.headers) lines.push(h);
        lines.push('');
        lines.push(part.body);
    }
    lines.push(`--${boundary}`);
    return Buffer.from(lines.join('\r\n'));
}

// ─── BufferToString ──────────────────────────────────────────────────────────

describe('BufferToString', () => {
    test('converts ASCII bytes to string', () => {
        const input = [72, 101, 108, 108, 111]; // "Hello"
        assert.equal(BufferToString(input), 'Hello');
    });

    test('returns empty string for empty array', () => {
        assert.equal(BufferToString([]), '');
    });

    test('handles UTF-8 multibyte characters', () => {
        // "é" = 0xC3 0xA9
        const input = [0xc3, 0xa9];
        assert.equal(BufferToString(input), 'é');
    });
});

// ─── parse ───────────────────────────────────────────────────────────────────

describe('parse', () => {
    describe('single text field', () => {
        test('extracts name and data', () => {
            const boundary = 'boundary123';
            const body = buildMultipart(boundary, [
                {
                    headers: ['Content-Disposition: form-data; name="username"'],
                    body: 'alice',
                },
            ]);

            const parts = parse(body, boundary);
            assert.equal(parts.length, 1);
            assert.equal(parts[0].name, 'username');
            assert.equal(parts[0].data.toString(), 'alice');
        });
    });

    describe('single file upload', () => {
        test('extracts filename, type, and data', () => {
            const boundary = 'fileBoundary';
            const body = buildMultipart(boundary, [
                {
                    headers: [
                        'Content-Type: text/plain',
                        'Content-Disposition: form-data; name="file"; filename="hello.txt"',
                    ],
                    body: 'Hello, world!',
                },
            ]);

            const parts = parse(body, boundary);
            assert.equal(parts.length, 1);
            assert.equal(parts[0].filename, 'hello.txt');
            assert.equal(parts[0].type, 'text/plain');
            assert.equal(parts[0].data.toString(), 'Hello, world!');
        });
    });

    describe('multiple parts', () => {
        test('parses all parts in order', () => {
            const boundary = 'multiBoundary';
            const body = buildMultipart(boundary, [
                {
                    headers: ['Content-Disposition: form-data; name="field1"'],
                    body: 'value1',
                },
                {
                    headers: ['Content-Disposition: form-data; name="field2"'],
                    body: 'value2',
                },
                {
                    headers: ['Content-Disposition: form-data; name="field3"'],
                    body: 'value3',
                },
            ]);

            const parts = parse(body, boundary);
            assert.equal(parts.length, 3);
            assert.equal(parts[0].name, 'field1');
            assert.equal(parts[0].data.toString(), 'value1');
            assert.equal(parts[1].name, 'field2');
            assert.equal(parts[1].data.toString(), 'value2');
            assert.equal(parts[2].name, 'field3');
            assert.equal(parts[2].data.toString(), 'value3');
        });

        test('handles mixed files and fields', () => {
            const boundary = 'mixedBoundary';
            const body = buildMultipart(boundary, [
                {
                    headers: ['Content-Disposition: form-data; name="description"'],
                    body: 'a photo',
                },
                {
                    headers: [
                        'Content-Type: image/png',
                        'Content-Disposition: form-data; name="photo"; filename="img.png"',
                    ],
                    body: 'PNGDATA',
                },
            ]);

            const parts = parse(body, boundary);
            assert.equal(parts.length, 2);
            assert.equal(parts[0].name, 'description');
            assert.equal(parts[1].filename, 'img.png');
            assert.equal(parts[1].type, 'image/png');
        });
    });

    describe('empty body', () => {
        test('returns no parts when body is empty', () => {
            const parts = parse(Buffer.from(''), 'boundary');
            assert.equal(parts.length, 0);
        });
    });

    describe('no matching boundary', () => {
        test('returns no parts when boundary is not found', () => {
            const body = Buffer.from('--wrongboundary\r\nContent-Disposition: form-data; name="x"\r\n\r\nval\r\n--wrongboundary');
            const parts = parse(body, 'correctboundary');
            assert.equal(parts.length, 0);
        });
    });

    describe('binary data', () => {
        test('preserves binary bytes in data field', () => {
            const boundary = 'binBoundary';
            const binaryPayload = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
            const prefix = Buffer.from(
                `--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: form-data; name="bin"; filename="data.bin"\r\n\r\n`
            );
            const suffix = Buffer.from(`\r\n--${boundary}`);
            const body = Buffer.concat([prefix, binaryPayload, suffix]);

            const parts = parse(body, boundary);
            assert.equal(parts.length, 1);
            assert.deepEqual(parts[0].data, binaryPayload);
        });
    });

    describe('unicode filenames', () => {
        test('parses unicode filename correctly', () => {
            const boundary = 'uniBoundary';
            const body = buildMultipart(boundary, [
                {
                    headers: [
                        'Content-Type: text/plain',
                        'Content-Disposition: form-data; name="uploads[]"; filename="äëñ.txt"',
                    ],
                    body: 'unicode content',
                },
            ]);

            const parts = parse(body, boundary);
            assert.equal(parts.length, 1);
            assert.equal(parts[0].filename, 'äëñ.txt');
        });
    });

    describe('DemoData', () => {
        test('parses its own demo body without error', () => {
            const { body, boundary } = DemoData();
            const parts = parse(body, boundary);
            assert.ok(parts.length > 0);
        });

        test('demo data contains expected filenames', () => {
            const { body, boundary } = DemoData();
            const parts = parse(body, boundary);
            const filenames = parts.map(p => p.filename).filter(Boolean);
            assert.ok(filenames.includes('A.txt'));
            assert.ok(filenames.includes('B.txt'));
        });

        test('demo data contains expected field value', () => {
            const { body, boundary } = DemoData();
            const parts = parse(body, boundary);
            const field = parts.find(p => p.name === 'input1');
            assert.ok(field);
            assert.equal(field.data.toString(), 'value1');
        });
    });
});
