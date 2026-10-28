/*
 * O SERVICE WORKER DO APP INSTALADO *(spec 71 §3.7)*.
 *
 * - Navegação (a página): da REDE primeiro, para uma publicação nova chegar no próximo carregamento; sem rede, a
 *   última página guardada.
 * - `assets/` (arquivos com hash no nome, que nunca mudam): do CACHE primeiro.
 * - O banco padrão: da REDE primeiro (sem o cache HTTP), para um banco novo publicado chegar no próximo reset ou
 *   carreira; sem rede, o último guardado. Com "cache e atualiza por trás", o primeiro reset depois de uma publicação
 *   recebia o banco ANTIGO (2026-10-27: a recalibração das regiões não chegava ao usuário).
 * - O resto da origem (ícones, manifest): responde do cache e atualiza por trás.
 *
 * Só o que é da própria origem e GET passa por aqui. O save não: ele mora no OPFS, fora de cache HTTP.
 */
const CACHE = 'csmanager-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== CACHE) await caches.delete(nome);
    await self.clients.claim();
  })());
});

const guardar = async (pedido, resposta) => {
  if (resposta.ok && resposta.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(pedido, resposta.clone());
  }
  return resposta;
};

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        return await guardar(pedido, await fetch(pedido));
      } catch {
        return (await caches.match(pedido)) ?? (await caches.match(new URL('./', self.registration.scope).href)) ?? Response.error();
      }
    })());
    return;
  }

  if (url.pathname.endsWith('/banco-padrao.json.gz')) {
    evento.respondWith((async () => {
      try {
        return await guardar(pedido, await fetch(pedido, { cache: 'no-store' }));
      } catch {
        return (await caches.match(pedido)) ?? Response.error();
      }
    })());
    return;
  }

  if (url.pathname.includes('/assets/')) {
    evento.respondWith((async () => (await caches.match(pedido)) ?? guardar(pedido, await fetch(pedido)))());
    return;
  }

  evento.respondWith((async () => {
    const guardado = await caches.match(pedido);
    const rede = fetch(pedido).then((r) => guardar(pedido, r)).catch(() => undefined);
    return guardado ?? (await rede) ?? Response.error();
  })());
});
