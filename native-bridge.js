/* 너울(NEOUL) 네이티브 앱 브릿지 v1.1 — Android(TWA) 표시 + iOS(Capacitor) 로그인 브릿지.
   일반 웹 브라우저·Android TWA(Chrome)에서는 첫 줄에서 즉시 종료되어 아무 동작도 하지 않는다.

   해결하는 문제: iOS 앱은 WKWebView로 사이트를 표시하는데, 구글 OAuth는 임베디드 웹뷰를
   차단한다(403 disallowed_useragent). 그래서 앱 안에서는 소셜 로그인을 시스템 브라우저
   (SFSafariViewController)로 열고, 로그인 완료 후 커스텀 스킴(com.neoulai.app://auth/callback)
   으로 앱에 복귀시켜 supabase-js 가 세션을 복원하도록 사이트를 같은 해시로 다시 연다.

   전제(설정): Supabase → Authentication → URL Configuration → Redirect URLs 에
   com.neoulai.app://auth/callback 이 등록되어 있어야 한다. */
(function () {
  'use strict';
  /* Android 앱(TWA)에서 열린 경우도 네이티브로 표시한다 — 첫 진입의 referrer(android-app://)를 세션에 기억.
     스토어 결제 정책 대응: html.neoul-native 에서는 앱 내 업셀 문구(.nv-upsell)를 숨긴다. */
  try {
    var twa = (document.referrer || '').indexOf('android-app://com.neoulai.app') === 0 || sessionStorage.getItem('neoul_twa') === '1';
    if (twa) { sessionStorage.setItem('neoul_twa', '1'); document.documentElement.classList.add('neoul-native', 'neoul-twa'); }
  } catch (e) { /* 저장소 차단 환경 */ }
  var C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) { return; }

  var P = C.Plugins || {};
  var SUPABASE_URL = 'https://iwrblahmszuthemfrhmy.supabase.co';
  var CALLBACK = 'com.neoulai.app://auth/callback';
  var SITE = 'https://www.neoulai.com/';

  /** 소셜 로그인을 시스템 브라우저로 연다 (웹뷰 차단 우회). */
  function nativeOAuth(provider) {
    var p = String(provider).replace('custom:', '');
    var url = SUPABASE_URL + '/auth/v1/authorize?provider=' + encodeURIComponent(p) +
              '&redirect_to=' + encodeURIComponent(CALLBACK);
    if (P.Browser && typeof P.Browser.open === 'function') {
      return P.Browser.open({ url: url, presentationStyle: 'popover' });
    }
    window.open(url, '_system');
  }

  /** 사이트가 정의한 window.nbOAuth 를 네이티브 버전으로 감싼다 (정의될 때까지 대기). */
  function install() {
    if (typeof window.nbOAuth === 'function' && !window.nbOAuth.__neoulNative) {
      var orig = window.nbOAuth;
      var wrapped = function (provider) {
        try { return nativeOAuth(provider); } catch (e) { return orig(provider); }
      };
      wrapped.__neoulNative = true;
      window.nbOAuth = wrapped;
      return true;
    }
    return false;
  }
  if (!install()) {
    var tries = 0;
    var timer = setInterval(function () { if (install() || ++tries > 150) { clearInterval(timer); } }, 100);
  }

  /** 로그인 완료 복귀: 커스텀 스킴의 해시/쿼리를 그대로 사이트 URL에 붙여 다시 연다.
      supabase-js(detectSessionInUrl)가 #access_token(암시적) 또는 ?code(PKCE)를 처리한다. */
  if (P.App && typeof P.App.addListener === 'function') {
    P.App.addListener('appUrlOpen', function (ev) {
      var u = ev && ev.url ? String(ev.url) : '';
      if (u.indexOf('auth/callback') === -1) { return; }
      var hi = u.indexOf('#'), qi = u.indexOf('?');
      var hash = hi >= 0 ? u.slice(hi) : '';
      var query = qi >= 0 ? u.slice(qi, hi >= 0 && hi > qi ? hi : undefined) : '';
      try { if (P.Browser && typeof P.Browser.close === 'function') { P.Browser.close(); } } catch (e) { /* iOS 만 지원 */ }
      window.location.href = SITE + query + hash;
    });
  }

  /** 네이티브 보정: 상태바 스타일, 문서 플래그(CSS 훅 .neoul-native). */
  try { if (P.StatusBar && typeof P.StatusBar.setStyle === 'function') { P.StatusBar.setStyle({ style: 'DARK' }); } } catch (e) { /* noop */ }
  document.documentElement.classList.add('neoul-native');
})();
