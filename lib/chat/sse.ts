/** 处理跨网络分块的 UTF-8、CRLF、多行 data 和末尾未换行事件。 */
export async function* readSseData(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  const lineData = (line: string) => {
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (line === '') {
          if (data.length) { yield data.join('\n'); data = []; }
        } else lineData(line);
      }
      if (done) break;
    }
    if (buffer) lineData(buffer.replace(/\r$/, ''));
    if (data.length) yield data.join('\n');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
