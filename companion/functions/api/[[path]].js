import { proxyRequest } from '../../pages-proxy.mjs';

export function onRequest({ request, env }) {
  return proxyRequest(request, env);
}
