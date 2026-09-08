/* 너울(NEOUL) 서비스 워커 v1
   전략: 동일 출처 GET만 취급한다. 문서·정적 자산은 네트워크 우선(network-first),
   실패 시에만 캐시로 폴백한다. 외부 출처(esm.sh·Supabase)와 비 GET 요청은
   서비스 워커가 건드리지 않고 그대로 통과시킨다. 낡은 화면을 강제로
   보여주는 사고를 구조적으로 차단하기 위한 설계다. */
var CACHE = 'neoul-v1';
var OFFLINE_URLS = ['/', '/manifest.json', '/favicon.ico', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', function (e) {
  // 설치 즉시 활성화 — 배포 직후 새 버전이 바로 반영되게 한다.
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(OFFLINE_URLS).catch(function () { /* 개별 실패는 무시 */ });
    }).then(function () { return self.skipWaiting(); })
  );
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
