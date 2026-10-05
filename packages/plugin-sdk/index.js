/** Access the API injected by NovaTerm into a sandboxed panel. */
export function getNova(scope = globalThis) {
  const api = scope.nova;
  if (api?.apiVersion !== 1 || typeof api.terminal?.read !== 'function' ||
      typeof api.terminal?.write !== 'function' || typeof api.ai?.complete !== 'function' ||
      typeof api.commands?.trigger !== 'function') {
    throw new Error('NovaTerm plugin API v1 is unavailable. Open this plugin in NovaTerm.');
  }
  return api;
}
