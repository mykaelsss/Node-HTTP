/**
 * Multipart Parser (Finite State Machine)
 * usage:
 * const multipart = require('./multipart.js');
 * const body = multipart.DemoData(); 							   // raw body
 * const body = Buffer.from(event['body-json'].toString(),'base64'); // AWS case
 * const boundary = multipart.getBoundary(event.params.header['content-type']);
 * const parts = multipart.Parse(body,boundary);
 * each part is:
 * { filename: 'A.txt', type: 'text/plain', data: <Buffer 41 41 41 41 42 42 42 42> }
 *  or { name: 'key', data: <Buffer 41 41 41 41 42 42 42 42> }
 */

type Part = {
  contentDispositionHeader: string
  contentTypeHeader: string
  part: number[]
}

type Input = {
  filename?: string
  name?: string
  type: string
  data: Buffer
}

enum ParsingState {
  INIT,
  READING_HEADERS,
  READING_DATA,
  READING_PART_SEPARATOR
}

export function BufferToString(array: number[]): string {
  return new TextDecoder().decode(new Uint8Array(array))
}

export function parse(multipartBodyBuffer: Buffer, boundary: string): Input[] {
  let lastLineBuffer: number[] = []
  let contentDispositionHeader = ''
  let contentTypeHeader = ''
  let state: ParsingState = ParsingState.INIT
  let buffer: number[] = []
  const allParts: Input[] = []

  let currentPartHeaders: string[] = []

  for (let i = 0; i < multipartBodyBuffer.length; i++) {
    const oneByte: number = multipartBodyBuffer[i]
    const prevByte: number | null = i > 0 ? multipartBodyBuffer[i - 1] : null
    // 0x0a => \n
    // 0x0d => \r
    const newLineDetected: boolean = oneByte === 0x0a && prevByte === 0x0d
    const newLineChar: boolean = oneByte === 0x0a || oneByte === 0x0d

    if (!newLineChar) {
      lastLineBuffer.push(oneByte)
    }
    if (ParsingState.INIT === state && newLineDetected) {
      // searching for boundary
      if ('--' + boundary === BufferToString(lastLineBuffer)) {
        state = ParsingState.READING_HEADERS // found boundary. start reading headers
      }
      lastLineBuffer = []
    } else if (ParsingState.READING_HEADERS === state && newLineDetected) {
      // parsing headers. Headers are separated by an empty line from the content. Stop reading headers when the line is empty
      if (lastLineBuffer.length) {
        currentPartHeaders.push(BufferToString(lastLineBuffer))
      } else {
        // found empty line. search for the headers we want and set the values
        for (const h of currentPartHeaders) {
          if (h.toLowerCase().startsWith('content-disposition:')) {
            contentDispositionHeader = h
          } else if (h.toLowerCase().startsWith('content-type:')) {
            contentTypeHeader = h
          }
        }
        state = ParsingState.READING_DATA
        buffer = []
      }
      lastLineBuffer = []
    } else if (ParsingState.READING_DATA === state) {
      // parsing data
      if (lastLineBuffer.length > boundary.length + 4) {
        lastLineBuffer = [] // mem save
      }
      if ('--' + boundary === BufferToString(lastLineBuffer)) {
        const j = buffer.length - lastLineBuffer.length
        const part = buffer.slice(0, j - 1)

        allParts.push(
          process({ contentDispositionHeader, contentTypeHeader, part })
        )
        buffer = []
        currentPartHeaders = []
        lastLineBuffer = []
        state = ParsingState.READING_PART_SEPARATOR
        contentDispositionHeader = ''
        contentTypeHeader = ''
      } else {
        buffer.push(oneByte)
      }
      if (newLineDetected) {
        lastLineBuffer = []
      }
    } else if (ParsingState.READING_PART_SEPARATOR === state) {
      if (newLineDetected) {
        state = ParsingState.READING_HEADERS
      }
    }
  }
  return allParts
}

export function DemoData(): { body: Buffer; boundary: string } {
  const boundary = '----WebKitFormBoundaryvef1fLxmoUdYZWXp'
  let body = 'trash1\r\n'
  // File A.txt
  body += `--${boundary}\r\n`
  body += 'Content-Type: text/plain\r\n'
  body +=
    'Content-Disposition: form-data; name="uploads[]"; filename="A.txt"\r\n'
  body += '\r\n'
  body += '@11X'
  body += '111Y\r\n'
  body += '111Z\rCCCC\nCCCC\r\nCCCCC@\r\n\r\n'
  // File B.txt
  body += `--${boundary}\r\n`
  body += 'Content-Type: text/plain\r\n'
  body +=
    'Content-Disposition: form-data; name="uploads[]"; filename="B.txt"\r\n'
  body += '\r\n'
  body += '@22X'
  body += '222Y\r\n'
  body += '222Z\r222W\n2220\r\n666@\r\n'
  // Field input1
  body += `--${boundary}\r\n`
  body += 'Content-Disposition: form-data; name="input1"\r\n'
  body += '\r\n'
  body += 'value1\r\n'
  // File unicode-äëñĄĆ_abcŤ.txt
  body += `--${boundary}\r\n`
  body += 'Content-Type: text/plain\r\n'
  body +=
    'Content-Disposition: form-data; name="uploads[]"; filename="unicode-äëñĄĆ_abcŤ.txt"\r\n'
  body += '\r\n'
  body += 'Title: unicode-äëñĄĆ_abcŤ\r\n'
  body += 'Lorem ipsum dolorat sit amet...\r\n'
  // End
  body += `--${boundary}\r\n`
  return {
    body: Buffer.from(body),
    boundary: boundary
  }
}

function process(part: Part): Input {
  // will transform this object:
  // { header: 'Content-Disposition: form-data; name="uploads[]"; filename="A.txt"',
  // info: 'Content-Type: text/plain',
  // part: 'AAAABBBB' }
  // into this one:
  // { filename: 'A.txt', type: 'text/plain', data: <Buffer 41 41 41 41 42 42 42 42> }
  const obj = function (str: string) {
    const k = str.split('=')
    const a = k[0].trim()

    const b = JSON.parse(k[1].trim())
    const o = {}
    Object.defineProperty(o, a, {
      value: b,
      writable: true,
      enumerable: true,
      configurable: true
    })
    return o
  }
  const header = part.contentDispositionHeader.split(';')

  const filenameData = header[2]
  let input = {}
  if (filenameData) {
    input = obj(filenameData)
    const contentType = part.contentTypeHeader.split(':')[1].trim()
    Object.defineProperty(input, 'type', {
      value: contentType,
      writable: true,
      enumerable: true,
      configurable: true
    })
  }
  // process the name field
  if (header && header.length > 1) Object.defineProperty(input, 'name', {
    value: (header[1].split('=')[1] || '').replace(/"/g, ''),
    writable: true,
    enumerable: true,
    configurable: true
  })

  Object.defineProperty(input, 'data', {
    value: Buffer.from(part.part),
    writable: true,
    enumerable: true,
    configurable: true
  })
  return input as Input
}