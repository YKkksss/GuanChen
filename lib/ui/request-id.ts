/** 局域网 HTTP 页面可能没有 randomUUID，仍用密码学随机字节生成标准请求标识。 */
export function createBrowserRequestId(source: Pick<Crypto,'getRandomValues'> & Partial<Pick<Crypto,'randomUUID'>> = globalThis.crypto): string {
  if (source.randomUUID) return source.randomUUID();
  const bytes=source.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const text=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return `${text.slice(0,8)}-${text.slice(8,12)}-${text.slice(12,16)}-${text.slice(16,20)}-${text.slice(20)}`;
}
