/** Read a bounded body without retaining an arbitrarily large provider/request payload. */
export async function boundedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {await reader.cancel(); throw new Error('Body exceeds limit');}
      text += decoder.decode(value, {stream: true});
    }
    return text + decoder.decode();
  } finally {reader.releaseLock();}
}
