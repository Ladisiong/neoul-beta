/* 너울(NEOUL) 서비스 워커 v1
   전략: 동일 출처 GET만 취급한다. 문서·정적 자산은 네트워크 우선(network-first),
   실패 시에만 캐시로 폴백한다. 외부 출처(esm.sh·Supabase)와 비 GET 요청은
   서비스 워커가 건드리지 않고 그대로 통과시킨다. 낡은 화면을 강제로
   보여주는 사고를 구조적으로 차단하기 위한 설계다. */
var CACHE = 'neoul-v2';

/* 프리캐시(install 단계 addAll)는 의도적으로 하지 않는다.
   첫 방문 때 문서를 한 번 더 받아 대역폭을 뺏고 LCP·Speed Index를 악화시킨다
   (실측: 프리캐시 5건일 때 모바일 성능 85 -> 80, Speed Index 3.4 -> 5.0초).
   캐시는 아래 fetch 핸들러가 실제로 쓰인 응답만 담는다 — 추가 요청 0건. */
self.addEventListener('install', function (e) {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (e) {
  // 이전 버전 캐시 전량 제거 후 즉시 제어권 인수.
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === CACHE) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) { return; }   // 외부 CDN·API는 미개입
  if (url.pathname.indexOf('/api/') === 0) { return; }    // 서버 응답은 캐시 금지

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) { return hit; }
        // 오프라인 상태의 화면 이동은 홈으로 폴백한다.
        if (req.mode === 'navigate') { return caches.match('/'); }
        return Response.error();
      });
    })
  );
});

/* 웹 푸시 — 서버(push-send)가 보낸 알림을 표시하고, 클릭하면 해당 화면으로 이동한다. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  var title = d.title || '너울';
  var opts = { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/app' } };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(url) >= 0 && 'focus' in list[i]) { return list[i].focus(); } }
    if (self.clients.openWindow) { return self.clients.openWindow(url); }
  }));
});
