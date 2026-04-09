# Node HTTP Server

An HTTP/1.1 server built from scratch in TypeScript using Node's raw TCP `net` module — no `http` module, no Express, no frameworks.

Built as an educational project to understand what happens underneath the abstractions.

## Features

- **Raw TCP server** — reads and writes bytes directly over `net.Socket`
- **HTTP/1.1 request parsing** — request line, headers, and body parsed manually from the buffer
- **Keep-alive connections** — handles multiple requests per socket for both HTTP/1.0 and HTTP/1.1
- **Body parsing** — supports four content types:
  - `application/json`
  - `application/x-www-form-urlencoded`
  - `multipart/form-data` (finite state machine parser)
  - `text/plain`
- **Dynamic router** — path parameters via `:param` segments, compiled to regex on registration
- **HTTP compliance** — rejects duplicate `Content-Length` headers, conflicting `Content-Length` + `Transfer-Encoding`, and missing `Content-Type` on requests with a body

## Getting Started

**Install dependencies**
```bash
npm install
```

**Run the server**
```bash
npx tsx server/server.ts
```

The server listens on port 3000.

## Usage

Register routes in `server/routes.ts`:

```ts
import { router } from './router';

router.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id });
});

router.post('/users', (req, res) => {
    res.status(201).json(req.body);
});
```

### Request object

| Property | Type | Description |
|----------|------|-------------|
| `method` | `string` | HTTP method |
| `path` | `string` | URL path (query string stripped) |
| `headers` | `Record<string, string>` | Lowercased header names |
| `body` | `unknown` | Parsed request body |
| `params` | `Record<string, string>` | Dynamic path parameters |

### Response object

```ts
res.send('Hello world');           // text/plain
res.json({ id: 1 });               // application/json
res.status(404).send('Not found'); // chained status
```

## Running Tests

```bash
npm test
```

Tests cover the multipart parser: `BufferToString`, single fields, file uploads, mixed parts, binary data, unicode filenames, and edge cases.

## Project Structure

```
server/
  server.ts        — TCP server, request parsing, body parsing
  router.ts        — Route registry and dynamic path matching
  routes.ts        — Route definitions
  multipart.ts     — Multipart/form-data FSM parser
  multipart.test.ts — Unit tests
```

## What I Learned

- How HTTP/1.1 frames requests using `Content-Length` to delimit message boundaries
- How keep-alive works — multiple requests multiplexed over a single TCP connection
- How multipart bodies are structured and parsed byte-by-byte
- How routers like Express compile path patterns to regex under the hood
