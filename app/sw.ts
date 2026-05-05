// app/sw.ts
// Service worker dla KSeF SaaS — offline caching + push notifications
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// Augmentacja typów — SW ma własny scope globalny (`injectionPoint` domyślnie `self.__SW_MANIFEST`)
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

// Push notification handler (subskrypcja — zadanie 17.7)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json() as {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    tag?: string;
  };

  const notificationOpts: NotificationOptions & { vibrate?: number[] } = {
    body: data.body,
    icon: data.icon ?? '/icons/icon-192x192.png',
    badge: data.badge ?? '/icons/icon-72x72.png',
    tag: data.tag,
    data: { url: data.url ?? '/' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOpts),
  );
});

// Klik w notyfikację — otwórz odpowiednią stronę w aplikacji
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string })?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});

serwist.addEventListeners();
