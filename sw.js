// sw.js - Service Worker لتخزين الملفات الثابتة وتشغيل الموقع بدون إنترنت
// الإصدار النهائي المتوافق مع مجمع أسواق ريادة المستهلك (PWA)

const CACHE_NAME = 'markets-pwa-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// تثبيت Service Worker وتخزين الملفات الأساسية مسبقاً
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ يتم تخزين الملفات الثابتة مسبقاً');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting(); // تفعيل الـ SW فوراً
});

// تفعيل Service Worker وتنظيف الكاش القديم
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('🗑️ حذف الكاش القديم:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim(); // السيطرة على الصفحات المفتوحة فوراً
});

// استراتيجية التخزين المؤقت:
// - لملفات HTML، CSS، JS، الخطوط، الأيقونات: Cache First (تعطى الأولوية للكاش)
// - لطلبات Supabase API وطلبات البيانات: Network First ثم Cache
// - للصور: Cache First مع تحديث دوري

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const request = event.request;

  // استثناء طلبات Supabase REST API (تُعامل بعناية خاصة)
  if (url.pathname.includes('/rest/v1/') || url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).then(response => {
        // لا نقوم بتخزين بيانات API في الكاش لأنها تتغير باستمرار
        return response;
      }).catch(() => {
        // في حالة عدم وجود اتصال، نعيد استجابة فارغة مع رسالة خطأ (يتم التعامل معها من التطبيق)
        return new Response(JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // للملفات الثابتة (HTML, CSS, JS, fonts, manifest) – استخدام Cache First
  if (request.destination === 'document' || 
      request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'font' ||
      url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then(networkResponse => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // للصور – Cache First ثم تحديث في الخلفية (stale-while-revalidate)
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // لكل شيء آخر (مثل الروابط الخارجية) – Network First ثم Cache
  event.respondWith(
    fetch(request).then(networkResponse => {
      if (networkResponse.status === 200 && request.method === 'GET') {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(request);
    })
  );
});