/** Real NUI callbacks are the only data source in FiveM. Preview is an explicit browser-only adapter. */
export function createTransport({ resource = globalThis.GetParentResourceName?.(), preview, timeout = 25000, fetcher = globalThis.fetch.bind(globalThis), onError = () => {}, captureContext = () => null } = {}) {
  const reads = new Map();
  let sequence = 0;
  async function execute(event, data, context) {
    if (typeof event !== 'string' || !event || /[?#\s]/.test(event)) throw new TypeError('Invalid NUI callback name');
    const request = ++sequence;
    if (/^(Wenmo\/SendMoney|Y\/TogglePremium|Crypto\/(BuyCrypto|SellCrypto|TransferCrypto))$/.test(event) && data && typeof data==='object' && !data.OperationId) data={...data,OperationId:globalThis.crypto?.randomUUID?.()||`phone-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    try {
      if (!resource) {
        if (typeof preview !== 'function') throw new Error('No FiveM connection; preview is not configured.');
        return await preview(event, data);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), /CapturePhoto|Selfie/.test(event) ? Math.max(timeout, 90000) : timeout);
      try {
        const response = await fetcher(`https://${resource}/${event}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify(data ?? {}), signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Callback returned HTTP ${response.status}`);
        const text = await response.text();
        if (!text.trim()) return null;
        let result;try { result=JSON.parse(text); } catch { throw new Error('Callback returned invalid JSON'); }
        if(result && result.__phoneError===true)throw new Error(String(result.error||'The phone action failed.'));
        return result;
      } finally { clearTimeout(timer); }
    } catch (cause) {
      const error = new Error(cause?.name === 'AbortError' ? 'The game did not answer in time. Check the resource before retrying.' : cause?.message || 'Request failed', { cause });
      error.event = event; error.request = request;
      onError(context === null ? { event, error, request } : { event, error, request, context });
      throw error;
    }
  }
  return function send(event, data = {}) {
    // Only identical reads are coalesced. User writes are never silently merged or retried.
    let context=null;try{context=captureContext(event,data)??null;}catch{ /* Optional context must not change transport behavior. */ }
    const isRead = /(?:^|\/)(?:Get|Can|Is)[A-Z]/.test(event);
    const readKey = isRead ? event + ':' + JSON.stringify(data) : null;
    const key = readKey === null ? null : context === null ? readKey : readKey + ':' + JSON.stringify(context);
    if (key && reads.has(key)) return reads.get(key);
    const promise = execute(event, data, context);
    if (key) { reads.set(key, promise); promise.then(() => reads.delete(key), () => reads.delete(key)); }
    return promise;
  };
}
