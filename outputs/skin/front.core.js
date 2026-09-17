/* ===================================================================
   front.core.js — 카페24 프론트 공통. 이 파일은 고치지 않는다.
   설정은 front.config.js, 사용법과 이유는 README 참고.
=================================================================== */
window.FRONT = window.FRONT || {};
FRONT.page = FRONT.page || function () { (FRONT._q = FRONT._q || []).push(arguments); };

/* --- util ---------------------------------------------------------- */
(() => {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  let toastTimer = null;

  const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // 인라인 SVG — 아이콘 파일에 의존하지 않는다. 색은 front.core.css 가 준다
  // 세 아이콘은 안쪽 선 모양(d)만 다르다. 껍데기를 한 벌로 둔다
  const toastIcon = (d, extra) =>
    '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10"/>' +
    '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"' +
    (extra ? ' ' + extra : '') + '/></svg>';

  const TOAST_ICON = {
    success: toastIcon('M5.8 10.2l2.7 2.7 5.7-5.7', 'stroke-linejoin="round"'),
    error: toastIcon('M10 5.5v5.2M10 13.8h.01'),
    info: toastIcon('M10 9v5.2M10 6.2h.01'),
  };

  const util = {
    // 1000 → '1,000'
    formatNumber(n) {
      return Number(n || 0).toLocaleString('ko-KR');   // 로캘을 안 주면 브라우저 언어를 따라 1.000 이 된다
    },

    // '2026-08-04T12:00:00' → '2026.08.04'
    formatDate(s) {
      return String(s || '').slice(0, 10).replace(/-/g, '.');
    },

    // 사용자 입력을 html로 넣기 전 필수
    escapeHtml(v) {
      return String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
    },

    // ?cate_no=125 → query('cate_no') → '125'
    query(key, url) {
      return new URLSearchParams(url ? url.split('?')[1] || '' : location.search).get(key);
    },

    cookie: {
      get(key) {
        const m = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
        return m ? decodeURIComponent(m[1]) : null;
      },
      set(key, value, minutes = 30) {
        const expires = new Date(Date.now() + minutes * 60000).toUTCString();
        document.cookie = `${key}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
      },
      remove(key) {
        util.cookie.set(key, '', -1);
      },
      // 값이 없거나 깨졌으면 null
      getJSON(key) {
        try {
          const raw = util.cookie.get(key);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      },
      setJSON(key, obj, minutes) {
        util.cookie.set(key, JSON.stringify(obj), minutes);
      },
    },

    // '2026-08-16 15:29:36' → ms. 못 읽으면 NaN
    // 사파리는 '-' 로 구분한 날짜에 시간이 붙으면 못 읽는다. 날짜 부분만 '/' 로 바꾼다
    parseDate(s) {
      return new Date(String(s || '').replace(/^(\d{4})-(\d{2})-(\d{2})(?!T)/, '$1/$2/$3')).getTime();
    },

    // url 이 비어 오는 상품이 있다. src="" 를 박으면 깨진 이미지 아이콘이 뜬다 —
    // 투명 1px 로 채우고 is-noimg 를 붙인다(모양은 스킨 CSS)
    // 템플릿 <img> 에 직접 src 를 넣을 때는 FRONT.util.BLANK_IMG 를 쓴다
    //   FRONT.util.img(item.imageUrl, item.name, 'thumb', ' loading="lazy"')
    BLANK_IMG,
    img(url, alt, className, extraAttrs) {
      const cls = [className, url ? '' : 'is-noimg'].filter(Boolean).join(' ');
      return '<img src="' + (url ? util.escapeHtml(url) : BLANK_IMG) + '"' +
        (cls ? ' class="' + cls + '"' : '') + ' alt="' + util.escapeHtml(alt) + '"' + (extraAttrs || '') + '>';
    },

    // 한 번만 계산해서 재사용. 실패하면 다음에 재시도
    once(fn) {
      let has = false;
      let cached;
      return (...args) => {
        if (has) return cached;
        cached = fn(...args);
        has = true;
        if (cached && typeof cached.then === 'function') {
          cached.catch(() => { has = false; cached = undefined; });
        }
        return cached;
      };
    },

    // 마지막 호출만 wait(ms) 뒤에 실행
    debounce(fn, wait = 200) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },

    // 콜백 방식을 Promise로. toPromise((cb) => CAFE24API.getCartCount(cb))
    toPromise(fn) {
      return new Promise((resolve, reject) =>
        fn((err, res) => (err ? reject(err) : resolve(res))),
      );
    },

    // 순서를 보존하며 그룹핑 → { map, keys }
    groupBy(list, keyOf) {
      const map = {};
      const keys = [];
      (list || []).forEach((item) => {
        const key = (typeof keyOf === 'function' ? keyOf(item) : item[keyOf]) ?? 'NONE';
        if (!map[key]) { map[key] = []; keys.push(key); }
        map[key].push(item);
      });
      return { map, keys };
    },

    // config.SKIN_BASE 가 있으면 앞에 붙인다. 멀티스킨에서 링크가 다른 스킨으로 튀는 걸 막는다
    //   url('/mypage/list.html') → '/skin-skin2/mypage/list.html'
    url(path) {
      const base = String(FRONT.config?.SKIN_BASE || '').replace(/^\/|\/$/g, '');
      const p = String(path || '');
      if (!base) return p;
      const pre = '/' + base;
      // 이미 접두사가 붙어 있으면 또 붙이지 않는다. 겹치면 404가 난다
      if (p === pre || p.indexOf(pre + '/') === 0) return p;
      return pre + (p.charAt(0) === '/' ? p : '/' + p);
    },

    // 로딩 중 카드 자리 채우기. 모양은 front.core.css 의 .skeleton-block
    //   FRONT.util.skeleton(8, 'card-skeleton', [{ className: 'img' }, { className: 'title' }])
    skeleton(count, wrapperClass, blocks) {
      const inner = blocks.map((b) => `<div class="skeleton-block ${b.className}"></div>`).join('');
      return `
        <li class="${wrapperClass}">
          ${inner}
        </li>`.repeat(Math.max(0, count));
    },

    // 같은 컨테이너를 다시 그리기 전에 Swiper를 정리한다.
    // 클래스로 찾으면 안 된다 — Swiper 4는 .swiper-initialized가 아니라
    // .swiper-container-initialized를 붙인다. 인스턴스는 버전 상관없이 el.swiper에 있다
    destroySwipers($scope) {
      $scope.find('[class*="swiper"]').addBack().each(function () {
        if (this.swiper) this.swiper.destroy(true, true);
      });
    },

    // config.DEBUG 일 때만 출력
    log(...args) {
      if (FRONT.config?.DEBUG) console.log('[FRONT]', ...args);
    },

    logError(label, err) {
      console.error(`[${label}]`, err);
    },

    // .catch(FRONT.util.onError('주문목록'))
    onError(label) {
      return (err) => util.logError(label, err);
    },

    // 화면 하단에 잠깐 떴다 사라지는 알림. front.core.css 가 있어야 보인다
    //   FRONT.util.toast('쿠폰이 발급되었어요')
    //   FRONT.util.toast('이미 발급받은 쿠폰이에요', { type: 'error' })
    // 한 번에 하나만 뜬다 — 새로 부르면 앞의 것을 교체한다
    toast(message, opt = {}) {
      const type = TOAST_ICON[opt.type] ? opt.type : 'success';   // 모르는 type 은 success 로

      clearTimeout(toastTimer);
      $('.front-toast').remove();

      const $el = $(
        '<div class="front-toast front-toast--' + type + '" role="status" aria-live="polite">' +
          TOAST_ICON[type] +
          '<span>' + util.escapeHtml(message) + '</span>' +
        '</div>'
      ).appendTo('body');

      // 붙자마자 클래스를 주면 트랜지션이 안 걸린다. 다음 프레임에 준다
      requestAnimationFrame(() => $el.addClass('is-visible'));

      toastTimer = setTimeout(() => {
        $el.removeClass('is-visible');
        setTimeout(() => $el.remove(), 300);   // CSS transition 과 맞춘다
      }, opt.duration || 2000);
    },

    /* DOM ready 배치가 전부 끝난 뒤로 미룬다.
       스킨에 이미 있던 공통 js(슬라이드 초기화 등)가 우리와 같은 컨테이너를
       ready에 잡는 경우, 어느 쪽이 이기는지가 캐시 유무에 따라 달라진다 —
       캐시가 비면 우리 렌더가 늦어 우리가 이기고, 캐시가 맞으면 우리가 먼저
       그려서 저쪽이 덮어쓴다. 여기 넣으면 항상 우리가 마지막이 된다 */
    afterReady(fn) {
      $(() => setTimeout(fn, 0));
    },
  };

  FRONT.util = util;
})();

/* --- api ----------------------------------------------------------- */
(() => {
  const resolve = (v) => (typeof v === 'function' ? v() : v);

  // baseURL / headers 는 함수로 넘기면 첫 요청 때 평가된다.
  // 그 외 옵션(timeout, withCredentials 등)은 axios로 그대로 넘어간다
  const create = ({ name = 'API', baseURL, headers, token, onUnauthorized, ...axiosOpts } = {}) => {
    let inst = null;
    let auth = token;
    let refreshing = null;   // 진행 중인 토큰 갱신. 401이 여러 개 와도 갱신은 하나만 나간다

    const client = () => {
      if (inst) return inst;

      if (typeof axios === 'undefined') {
        throw new Error(
          `[FRONT.api] axios가 없습니다. (${name})\n` +
            '이 페이지가 쓰는 레이아웃에 axios CDN <script> 태그가 있는지 확인하세요.\n' +
            '레이아웃이 메인용/공통 두 개라면 양쪽 다 넣어야 합니다.',
        );
      }

      const url = resolve(baseURL);
      if (!url) {
        throw new Error(`[FRONT.api] ${name}의 주소가 비어 있습니다. FRONT.config를 확인하세요.`);
      }

      // Content-Type은 axios가 정한다.
      // 객체면 application/json, FormData면 boundary까지 붙은 multipart
      inst = axios.create({ ...axiosOpts, baseURL: url, headers: resolve(headers) });

      inst.interceptors.request.use((cfg) => {
        const t = resolve(auth);
        cfg.__token = t;   // 어떤 토큰으로 나갔는지. 401 때 이미 갱신됐는지 가린다
        if (t) cfg.headers.Authorization = `Bearer ${t}`;
        return cfg;
      });

      /* 401이면 토큰을 한 번 갱신하고 그 요청만 다시 보낸다.
         갱신은 동시에 하나만 나간다 — 요청마다 따로 부르면 같은 refreshToken 으로
         갱신이 여러 번 나가고, 쓴 토큰을 무효화하는 서버에서는 두 번째부터 거절당해
         로그인이 통째로 풀린다. 탭에 돌아와 FRONT.cache 가 여러 조회를 한꺼번에
         다시 던지는 순간이 정확히 그 상황이다.
         갱신이 실패하면(갱신 훅이 없는 몰 포함) 원래의 401을 그대로 올린다 —
         호출부가 받아야 하는 건 '갱신 실패'가 아니라 '인증 안 됨'이다 */
      if (onUnauthorized) {
        inst.interceptors.response.use(null, (err) => {
          const cfg = err.config;
          if (!cfg || cfg.__retried || !err.response || err.response.status !== 401) {
            return Promise.reject(err);
          }
          cfg.__retried = true;
          // 이 요청이 나간 뒤 토큰이 바뀌었다 = 누군가 이미 갱신했다. 새 토큰으로 다시 보내기만 한다.
          // 늦게 온 401 마다 갱신을 또 부르면 이미 쓴 refreshToken 으로 나간다
          if (cfg.__token !== resolve(auth)) return inst.request(cfg);
          if (!refreshing) {
            refreshing = onUnauthorized();
            // 끝나면 놓아준다. 성공·실패 둘 다 여기서 받아야 다음 401이 다시 갱신할 수 있다
            refreshing.then(() => { refreshing = null; }, () => { refreshing = null; });
          }
          return refreshing.then(() => inst.request(cfg), () => Promise.reject(err));
        });
      }

      return inst;
    };

    const api = {
      // get('/path', { page: 1 }) ← 두 번째 인자가 쿼리스트링
      get(url, params, config) { return client().get(url, { params, ...config }); },
      post(url, data, config) { return client().post(url, data, config); },
      put(url, data, config) { return client().put(url, data, config); },
      patch(url, data, config) { return client().patch(url, data, config); },
      delete(url, config) { return client().delete(url, config); },

      // 문자열도 함수도 받는다
      setToken(v) { auth = v; return api; },

      // axios 인스턴스가 직접 필요할 때
      raw: client,
    };

    return api;
  };

  /*  FRONT.api.middleware  자체 백엔드        우리 토큰
      FRONT.api.front       카페24 프론트 API  client_id 헤더
      FRONT.api.sdk         카페24 JS SDK      카페24 세션 (콜백)   */
  const api = {
    create,

    /* 로그인 토큰이 있는 몰은 front.config.js 에서 TOKEN · ON_UNAUTHORIZED 를 채운다.
       코어가 특정 로그인 방식(SSO 등)을 직접 부르면 그 방식이 없는 몰에서 첫 요청이 터진다.
       나중에 붙여도 되고(setToken), 훅이 없으면 헤더 없이 나간다 */
    middleware: create({
      name: '미들웨어',
      baseURL: () => FRONT.config.MIDDLEWARE_BASE,
      token: () => (FRONT.config.TOKEN ? FRONT.config.TOKEN() : null),
      onUnauthorized: () => {
        if (FRONT.config.ON_UNAUTHORIZED) return FRONT.config.ON_UNAUTHORIZED();
        // 갱신할 방법이 없다. 거절하면 인터셉터가 원래의 401 을 올린다
        FRONT.util.log('ON_UNAUTHORIZED 훅이 없어 401 을 그대로 올린다');
        return Promise.reject();
      },
    }),

    front: create({
      name: '카페24 프론트 API',
      baseURL: () => FRONT.config.CAFE24_BASE,
      headers: () => ({ 'X-Cafe24-Client-Id': FRONT.config.CLIENT_ID }),
    }),
  };

  const noSdk = () =>
    new Error('[FRONT.api.sdk] CAFE24API가 없습니다. 카페24 앱 스크립트가 로드됐는지 확인하세요.');

  let sdkInit = null;   // CAFE24API.init 결과. 페이지당 한 번이면 된다

  api.sdk = {
    // call() 이 처음 불릴 때 알아서 부른다. 직접 부를 일은 드물다
    init() {
      if (typeof CAFE24API === 'undefined') throw noSdk();
      return sdkInit || (sdkInit = CAFE24API.init({ client_id: FRONT.config.CLIENT_ID }));
    },

    // 마지막 인자가 콜백인 SDK 메서드는 전부 이걸로 부른다
    //   sdk.call('addCurrentProductToCart', mallId, time, appKey, memberId, hmac)
    // 실패는 항상 reject로 온다. .catch() 하나만 달면 된다
    call(method, ...args) {
      if (typeof CAFE24API === 'undefined') return Promise.reject(noSdk());
      if (typeof CAFE24API[method] !== 'function') {
        return Promise.reject(new Error(`[FRONT.api.sdk] CAFE24API.${method}() 가 없습니다.`));
      }
      try { api.sdk.init(); } catch (e) { return Promise.reject(e); }
      return FRONT.util.toPromise((cb) => CAFE24API[method](...args, cb));
    },

    cartCount() { return api.sdk.call('getCartCount'); },
    couponCount() { return api.sdk.call('getCouponCount'); },
  };

  FRONT.api = api;
})();

/* --- cache --------------------------------------------------------- */
(() => {
  const memory = {};   // 이 페이지가 살아있는 동안의 캐시
  const inflight = {}; // 같은 키로 동시에 들어온 요청은 하나만 나간다
  const PREFIX = 'front_cache:';

  /* ttl 은 '언제 뒤에서 다시 받을까'만 정한다. 얼마나 오래됐든 일단 화면에 뿌린다.
     sessionStorage 는 탭이 살아 있는 내내 남으므로, 두 시간 자리를 비웠다 돌아오면
     두 시간 전 가격과 재고가 먼저 그려졌다가 교체된다. 값이 눈앞에서 바뀌는 건
     안 보여주느니만 못하다.

     maxAge 를 넘긴 캐시는 그리지 않고 새로 받을 때까지 기다린다(스켈레톤 유지).
     단, 새로 받는 데 실패하면 아무리 오래됐어도 있는 걸 쓴다 — 끊긴 사용자에게
     빈 화면을 주는 게 더 나쁘다. */
  const MAX_AGE = 30 * 60 * 1000;

  // sessionStorage는 페이지 이동(리스트→상세→뒤로가기)을 넘어 살아남는다.
  // 탭 단위라 새 탭에서 열면 비어 있다 — 그게 더 안전하다
  const readSession = (key) => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const writeSession = (key, entry) => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch (e) {
      // 용량 초과 등. 캐시는 실패해도 흐름을 막지 않는다
    }
  };

  // 메모리 → sessionStorage 순으로 읽고, 읽은 것은 메모리에 올린다
  const readEntry = (key) => {
    const entry = memory[key] || readSession(key);
    if (entry) memory[key] = entry;
    return entry;
  };

  // get(무엇을 그릴까)과 has(스켈레톤을 띄울까)가 같은 기준을 써야 한다 — 한 곳에만 둔다
  const isExpired = (entry, maxAge) => !!maxAge && Date.now() - entry.time >= maxAge;

  // get(뒤에서 새로 받을까)과 revalidateAll(탭 복귀 때 받을까)의 기준. 역시 한 곳에만 둔다.
  // isExpired 와 달리 0 은 '항상 오래됨'이다
  const isStale = (entry, ttl) => Date.now() - entry.time >= ttl;

  // 바뀌었는지 비교할 때 쓸 지문. ignore에 준 이름은 깊이 상관없이 빼고 본다.
  // 요청할 때마다 값이 달라지는 필드(조회수처럼 우리 조회로 값이 올라가는 것)가
  // 섞여 있으면, 내용이 그대로인데도 매번 다시 그리게 된다
  const fingerprint = (value, ignore) =>
    JSON.stringify(value, ignore?.length ? (k, v) => (ignore.includes(k) ? undefined : v) : undefined);

  // 같은 키로 이미 나간 요청이 있으면 그것을 돌려준다.
  // clear() 가 inflight 에서 뺀 요청은 돌아와도 캐시에 쓰지 않는다 — 지운 값이 되살아난다
  const refetch = (key, fetcher) => {
    if (inflight[key]) return inflight[key];
    const p = fetcher()
      .then((data) => {
        if (inflight[key] === p) {
          memory[key] = { data, time: Date.now() };
          writeSession(key, memory[key]);
        }
        return data;
      })
      .finally(() => { if (inflight[key] === p) delete inflight[key]; });
    p.notified = new Set();   // 이 응답에 이미 매단 onRevalidate 들
    p.direct = new Set();     // 이 응답을 get() 이 기다려 돌려줘서 호출부가 직접 그리는 onRevalidate 들
    return (inflight[key] = p);
  };

  /* 뒤에서 새로 받아, 화면에 떠 있는 것(prev)과 다를 때만 onRevalidate 를 부른다.
     prev 가 없으면(첫 조회가 실패해 화면이 비어 있다) 받는 대로 부른다.

     한 응답에 같은 onRevalidate 는 한 번만 매단다. 탭 복귀 때 visibilitychange 와
     focus 가 같이 뜨거나, 페이지 로드 때 나간 재검증에 복귀가 합류하면 같은 요청에
     두 번 매달려 두 번 그려진다. 부수고 다시 만드는 렌더(스와이퍼 등)는 그러면 깨진다 */
  const revalidate = (key, fetcher, prev, { onRevalidate, isValid, ignore }) => {
    const p = refetch(key, fetcher);
    if (!onRevalidate) return p.catch(() => {});
    if (p.notified.has(onRevalidate)) return p;
    p.notified.add(onRevalidate);
    return p
      .then((fresh) => {
        // 응답이 늦게 왔는데 그 사이 화면이 바뀌었으면 그리지 않는다
        if (isValid && !isValid()) return;
        // 먼저 매달린 뒤 get() 이 같은 요청을 기다려 돌려줬다 — 그쪽이 그리므로 여기선 넘긴다
        if (p.direct.has(onRevalidate)) return;
        if (prev && fingerprint(fresh, ignore) === fingerprint(prev.data, ignore)) return;
        onRevalidate(fresh);
      })
      .catch(() => {}); // 백그라운드 실패는 조용히 넘긴다
  };

  /* 화면에 살아 있는 조회들.
     탭에 돌아왔을 때 무엇을 다시 확인할지 알아야 한다.

     onRevalidate 함수를 열쇠로 쓴다. 같은 렌더 함수 = 같은 DOM 자리라는 뜻이라,
     상품목록에서 1→2→3페이지로 넘어가면 3페이지 등록이 1페이지 것을 밀어낸다.
     키로 모으면 세 페이지를 다 다시 받아 마지막에 도착한 것이 화면을 차지한다 —
     3페이지를 보고 있는데 1페이지가 그려질 수 있다.

     이 목록은 페이지 자바스크립트와 수명이 같다. 다른 페이지로 가면 통째로 사라지고,
     뒤로가기(bfcache)로 돌아오면 등록도 같이 살아 돌아온다 */
  const live = new Map();

  const cache = {
    // 캐시가 있으면 즉시 반환하고, ttl이 지났으면 뒤에서 새로 받아 onRevalidate로 알린다.
    // 내용이 그대로면 onRevalidate는 부르지 않는다 — 불필요한 리렌더를 막는다
    //   FRONT.cache.get(key, fetcher, { ttl, maxAge, onRevalidate, isValid, ignore })
    // maxAge 를 넘긴 캐시는 아예 그리지 않는다(위 MAX_AGE 참고). 0 을 주면 상한 없음
    get(key, fetcher, opts = {}) {
      // 기본값은 여기서 한 번만 채운다. live 에도 채운 것을 담아야 revalidateAll 이 다시 채우지 않는다
      const { ttl = 30000, maxAge = MAX_AGE } = opts;
      const o = { ...opts, ttl, maxAge };
      if (o.onRevalidate) live.set(o.onRevalidate, { key, fetcher, opts: o });

      // 호출부가 이 응답을 직접 그린다. 기다리는 사이 탭 복귀(revalidateAll)가 같은 요청에
      // onRevalidate 를 매달면 한 응답이 두 번 그려지므로, 이미 매단 것으로 쳐둔다
      const awaited = () => {
        const p = refetch(key, fetcher);
        if (o.onRevalidate) { p.notified.add(o.onRevalidate); p.direct.add(o.onRevalidate); }
        return p;
      };

      const entry = readEntry(key);
      if (!entry) return awaited();

      // 너무 오래됐다 — 그리지 않고 기다린다.
      // 못 받아오면 그때 가서 있는 것이라도 쓴다
      if (isExpired(entry, maxAge)) {
        FRONT.util.log('캐시가 maxAge 를 넘겨 새로 받는다:', key);
        return awaited().catch(() => entry.data);
      }

      if (isStale(entry, ttl)) revalidate(key, fetcher, entry, o);
      return Promise.resolve(entry.data);
    },

    /* 목록 화면의 흐름을 한 번에 — 스켈레톤 → get → 그리기 → 실패 처리.
         FRONT.cache.load(key, fetcher, { render, skeleton, onError, isValid, ttl, maxAge, ignore })

       get + has 를 손으로 조합하면 두 군데서 어긋났다.
         - has() 에 get() 과 같은 maxAge 를 넘겨야 한다
         - isValid 는 재검증 때만 불린다. 캐시가 없는 첫 조회는 get().then 으로 바로 오므로
           호출부가 거기서 한 번 더 확인해야 했다 — 빠뜨리면 늦게 온 1페이지가 3페이지를 덮는다
       여기선 성공·재검증·실패 모두 isValid 를 거친다.
       render 는 onRevalidate 로도 쓰이므로 이름 있는 함수로 넘긴다(get 의 주의와 같다).
       onError 가 없으면 reject 를 그대로 올린다 */
    load(key, fetcher, { render, skeleton, onError, isValid = () => true, ...opts }) {
      if (skeleton && !cache.has(key, opts.maxAge)) skeleton();
      return cache.get(key, fetcher, { ...opts, isValid, onRevalidate: render })
        .then((data) => { if (isValid()) render(data); })
        .catch((err) => {
          if (!isValid()) return;
          if (!onError) throw err;
          onError(err);
        });
    },

    /* 화면에 살아 있는 조회들을 다시 확인한다.
       maxAge 는 보지 않는다 — 그건 첫 렌더에서 '무엇을 그릴까'를 정하는 규칙이고,
       여기선 화면에 이미 무언가 떠 있다. 캐시가 아예 없는 것(첫 조회가 실패한 것)도
       다시 받아 그린다 — online 복귀가 만회하려는 게 바로 그 경우다.
       같은 키로 이미 나간 요청이 있으면 inflight 이 합쳐준다 */
    revalidateAll() {
      let n = 0;
      live.forEach(({ key, fetcher, opts }) => {
        // 호출부가 '아직 이 화면이 맞나'를 판단할 수 있으면 존중한다
        if (opts.isValid && !opts.isValid()) return;
        const entry = readEntry(key);
        if (entry && !isStale(entry, opts.ttl)) return;
        n++;
        revalidate(key, fetcher, entry, opts);
      });
      FRONT.util.log('재검증 대상 ' + n + '건');
      return n;
    },

    // 키를 주면 하나만, 안 주면 전부.
    // 살아 있는 조회 목록도 같이 정리한다 — 안 그러면 비워놓은 캐시를
    // 다음 탭 복귀 때 유령 등록이 도로 채운다.
    // 나가 있는 요청도 놓는다 — 돌아와서 옛 값을 다시 쓰지 않게, 다음 get() 이 거기 합류하지 않게
    clear(key) {
      if (key) {
        delete memory[key];
        delete inflight[key];
        try { sessionStorage.removeItem(PREFIX + key); } catch (e) {}
        live.forEach((v, fn) => { if (v.key === key) live.delete(fn); });
        return;
      }
      live.clear();
      Object.keys(memory).forEach((k) => delete memory[k]);
      Object.keys(inflight).forEach((k) => delete inflight[k]);
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.indexOf(PREFIX) === 0)
          .forEach((k) => sessionStorage.removeItem(k));
      } catch (e) {}
    },


    /* '지금 그릴 수 있는 값이 있나'를 묻는 것이다. 호출부는 전부
       if (!has(key)) 스켈레톤 으로 쓴다.

       maxAge 를 넘긴 캐시는 get 이 그리지 않고 새로 받을 때까지 기다린다.
       그런데 여기서 true 를 주면 호출부가 스켈레톤을 감춰버려, 정작 기다리는
       동안 빈 자리가 남는다 — 스켈레톤이 가장 필요한 순간에 없어지는 셈이다.
       그래서 나이도 같이 본다. 기준은 get 과 같아야 하므로 인자로 받는다 */
    has(key, maxAge = MAX_AGE) {
      const entry = readEntry(key);
      return !!entry && !isExpired(entry, maxAge);
    },

  };

  FRONT.cache = cache;

  /* 돌아왔을 때 다시 확인한다 ------------------------------------------
     여태는 페이지를 옮겨야만 재검증이 걸렸다. 모바일에서 앱을 바꿨다가
     10분 뒤 돌아오면 옛날 화면이 그대로 남아 있었다.

     visibilitychange  탭 전환·화면 끔 (모바일은 대부분 이것)
     focus             데스크톱에서 다른 앱 갔다 오기 — 이땐 탭이 계속 visible 이라
                       visibilitychange 가 안 뜬다
     online            끊겼다 붙었을 때. 그동안 실패한 조회를 만회한다
     pageshow          뒤로가기 bfcache 복원. persisted 일 때만.
                       — 카페24 스킨 페이지에서는 보통 안 뜬다. 카페24가
                         Cache-Control: no-store 를 보내 bfcache 를 막는다
                         (notRestoredReasons: response-cache-control-no-store).
                         뒤로가면 페이지가 통째로 다시 뜨므로 그 경로는 어차피
                         스크립트가 처음부터 도는 것과 같다. 언젠가 헤더가 바뀌면
                         저절로 맞게 도록 남겨둔다

     visibilitychange 와 focus 는 복귀 때 같이 뜬다. 따로 합치지 않는다 —
     요청은 inflight 이, 콜백은 revalidate 가 응답당 한 번으로 합친다 */
  const wake = (why) => {
    if (document.visibilityState === 'hidden') return;
    FRONT.util.log('재검증 트리거:', why);
    cache.revalidateAll();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake('visibilitychange');
  });
  window.addEventListener('focus', () => wake('focus'));
  window.addEventListener('pageshow', (e) => { if (e.persisted) wake('bfcache'); });
  window.addEventListener('online', () => wake('online'));
})();

/* --- member -------------------------------------------------------- */
(() => {
  const COOKIE_KEY = 'front_member';
  const COOKIE_MIN = 30;
  const FIELDS = ['member_id', 'group_name', 'group_no', 'nick_name', 'name'];
  const MAX_RETRY = 10;
  const RETRY_MS = 1000;

  let promise = null;

  // 결과는 세 가지다.
  //   ready:false  SDK가 아직 없음 — 판단 불가. 캐시하면 안 된다
  //   guest:true   SDK가 Error(403) — 비회원 확정. 재시도 대상이 아니다
  //   그 외        로그인. customer.member_id 가 비어 있으면 재시도 대상
  const getCustomer = () => {
    if (typeof CAFE24API === 'undefined') return Promise.resolve({ ready: false });
    return FRONT.api.sdk
      .call('getCustomerInfo')
      .then((res) => ({ ready: true, customer: res?.customer }))
      .catch(() => ({ ready: true, guest: true }));
  };

  const remember = (customer) => {
    member.info = customer;
    const slim = {};
    FIELDS.forEach((k) => { if (customer[k] != null) slim[k] = customer[k]; });
    FRONT.util.cookie.setJSON(COOKIE_KEY, slim, COOKIE_MIN);
  };

  const fromSdk = () => {
    if (promise) return promise;

    promise = new Promise((resolve) => {
      let attempts = 0;

      const attempt = () => {
        getCustomer().then(({ ready, guest, customer }) => {
          // 판단 불가 — 메모를 버려서 다음 호출에 다시 시도하게 한다
          if (!ready) {
            promise = null;
            return resolve(null);
          }
          // 아래 경로들은 결과가 확정이므로 메모를 유지한다.
          // 안 그러면 비회원이 fetch() 부를 때마다 SDK를 다시 친다
          if (guest) { verified = true; return resolve(null); }

          if (customer?.member_id) {
            verified = true;
            remember(customer);
            return resolve(customer);
          }
          if (++attempts < MAX_RETRY) {
            FRONT.util.log(`member 재시도 ${attempts}/${MAX_RETRY}`);
            return setTimeout(attempt, RETRY_MS);
          }
          FRONT.util.cookie.remove(COOKIE_KEY);
          resolve(null);
        });
      };

      attempt();
    });

    return promise;
  };

  // 쿠키 캐시가 실제 로그인 상태와 어긋났는지 뒤에서 확인한다.
  // 로그아웃 링크를 못 잡은 경로(폼 제출, 계정 전환)를 자가 치유한다.
  // 페이지당 한 번만 돈다 — 판단이 불가능했던 경우에만 다시 시도한다
  let verified = false;

  const verify = (cachedId) => {
    if (verified) return;
    verified = true;

    getCustomer().then(({ ready, guest, customer }) => {
      // SDK가 없거나, 로그인인데 member_id가 아직 비어 있는 과도기 = 판단 불가.
      // 캐시를 건드리지 않고 다음 기회로 미룬다
      if (!ready || (!guest && !customer?.member_id)) { verified = false; return; }

      const actual = guest ? null : customer.member_id;
      if (actual === cachedId) return;

      FRONT.util.log('member 캐시 불일치 — 캐시:', cachedId, '실제:', actual);
      member.clear();           // verified 는 건드리지 않는다 — 이 페이지에서 재검증이 돌지 않는다
      if (actual) {             // 계정이 바뀐 경우 방금 받은 새 회원으로 채운다
        remember(customer);
        promise = Promise.resolve(customer);
      }
    });
  };

  const member = {
    // 마지막으로 조회된 회원 정보. 조회 전이면 null
    info: null,

    // 로그인 회원 정보를 Promise로. 비로그인이면 null
    // 쿠키 캐시(30분) → 없으면 SDK 조회. 동시에 여러 번 불러도 요청은 한 번
    fetch() {
      const cached = member.info?.member_id ? member.info : FRONT.util.cookie.getJSON(COOKIE_KEY);
      if (cached?.member_id) {
        member.info = cached;
        verify(cached.member_id);
        return Promise.resolve(cached);
      }
      return fromSdk();
    },

    // 직접 부를 일은 드물다 — 아래에서 로그아웃을 스스로 잡는다
    clear() {
      member.info = null;
      promise = null;
      FRONT.util.cookie.remove(COOKIE_KEY);
    },
  };

  FRONT.member = member;

  /* 로그아웃 감지 --------------------------------------------------
     캐시를 안 버리면 쿠키(30분)가 살아 있어 로그아웃 후에도 회원으로 보인다.
     호출부가 clear()를 부르기로 해두면 언젠가 빠뜨린다 — 코어가 잡는다.
     클릭은 위임이라 나중에 그려지는 링크도 걸린다.
     폼 제출 방식 로그아웃은 못 잡는다 — 그건 fetch()의 verify가 받아낸다 */
  if (/logout/i.test(location.pathname)) member.clear();

  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('a[href*="logout"]')) member.clear();
  }, true);
})();

/* --- cart ---------------------------------------------------------- */
(() => {
  /* SDK addCart 는 실패를 콜백 첫 인자로 주지 않는다. err 는 null 이고 두 번째 인자에 실려 온다.
       { cart: [...] }                              성공
       { errors: [{ code, message, more_info }] }   담기 거절 (422 — 품절, 착불 설정 불일치 등)
       { error: { code, message } }                 세션 문제 (403 비로그인)
     sdk.call 만 믿으면 실패도 resolve 로 흘러, 안 담겼는데 장바구니로 이동한다 */
  const toError = (res) => {
    const first = res?.errors?.[0] || res?.error;
    if (!first) return null;
    return Object.assign(new Error(first.message || '장바구니 담기에 실패했습니다.'), {
      code: first.code,
      moreInfo: first.more_info,   // 어느 상품이 왜 거절됐는지
      // 세트상품은 프론트 addCart 가 받지 않는다(상세에서만 담긴다). 구분 코드가 없어 메시지로 가른다
      bundle: /bundle/i.test(first.message || ''),
    });
  };

  // item 은 호출부의 원래 객체다. 결과에 그대로 돌려줘야 상품명 등으로 실패를 짚을 수 있다
  // toItem 이 던져도(필드 누락 등) 그 상품만 실패로 남긴다
  const addOne = async (item, toItem, basketType, prepaid) => {
    try {
      const err = toError(await FRONT.api.sdk.call('addCart', basketType, prepaid, [toItem(item)]));
      return err ? { item, ok: false, err } : { item, ok: true };
    } catch (err) {
      return { item, ok: false, err };
    }
  };

  FRONT.cart = {
    /* 한 개씩 순서대로 담고 [{ item, ok, err }] 를 준다. reject 하지 않는다.
       묶어 보내면 하나가 거절될 때 묶음이 통째로 떨어지고 어느 상품 탓인지 모른다.
       재시도도 하지 않는다 — 일부만 담겼는지 알 수 없어 같은 상품이 두 번 담길 수 있다.
       담은 뒤 처리(카운트 갱신, 완료 레이어)와 중복 클릭 막기는 호출부 몫이다.

         FRONT.cart.add(selected, {
           toItem: (p) => ({ product_no: Number(p.productNo), variants_code: p.variantsCode, quantity: 1 }),
         }).then((results) => results.filter((r) => !r.ok))   // r.item 은 selected 의 원소

       toItem      호출부 객체 → SDK 형식. 없으면 이미 SDK 형식이라고 본다
       basketType  A0000 일반 / A0001 무이자
       prepaid     P 선불 / C 착불 — 상품 설정과 다르면 422 */
    async add(items, { toItem = (x) => x, basketType = 'A0000', prepaid = 'P' } = {}) {
      const results = [];
      for (const item of [].concat(items || [])) {
        results.push(await addOne(item, toItem, basketType, prepaid));
      }
      return results;
    },
  };
})();

/* --- page ---------------------------------------------------------- */
(() => {
  const pending = [];
  const isReady = () => document.readyState !== 'loading';

  // 선택자면 요소 존재 여부, 함수면 그 반환값으로 판단한다
  const passes = (when) =>
    typeof when === 'function' ? when() : document.querySelector(when);

  const run = (entry) => {
    try {
      if (entry.when && !passes(entry.when)) return;
      entry.fn();
    } catch (err) {
      // 하나가 죽어도 나머지는 계속 돈다
      FRONT.util.logError(`FRONT.page${typeof entry.when === 'string' ? ' ' + entry.when : ''}`, err);
    }
  };

  // FRONT.page(fn) / FRONT.page('.selector', fn) / FRONT.page(() => 조건, fn)
  const register = (when, fn) => {
    const entry = fn ? { when, fn } : { when: null, fn: when };
    if (typeof entry.fn !== 'function') {
      console.error('[FRONT.page] 실행할 함수를 넘겨야 합니다.', when, fn);
      return;
    }
    if (isReady()) run(entry);
    else pending.push(entry);
  };

  // 이 파일보다 먼저 실행된 페이지 스크립트가 쌓아둔 것들
  const queued = FRONT._q || [];
  FRONT.page = register;
  delete FRONT._q;
  queued.forEach((args) => register(args[0], args[1]));

  // 이미 준비된 상태라면 이 리스너는 발화하지 않고, pending도 비어 있다
  document.addEventListener('DOMContentLoaded', () => {
    while (pending.length) run(pending.shift());
  });
})();
