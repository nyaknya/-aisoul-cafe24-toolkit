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
      return Number(n || 0).toLocaleString();
    },

    // '2026-08-04T12:00:00' → '2026.08.04'
    formatDate(s) {
      return String(s || '').slice(0, 10).replace(/-/g, '.');
    },

    // 사용자 입력을 html로 넣기 전 필수
    escapeHtml(v) {
      return String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
    },

    // 'a, b' → '<p class="opt">a<br>b</p>'
    listToHtml(value, className = '') {
      const parts = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return '';
      return `<p class="${className}">${parts.map((p) => util.escapeHtml(p)).join('<br>')}</p>`;
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
    toast(message, options) {
      const opt = options || {};
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
    let auth = token || null;
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

  api.sdk = {
    // 쓰기 전에 한 번 부른다
    init() {
      if (typeof CAFE24API === 'undefined') throw noSdk();
      return CAFE24API.init({ client_id: FRONT.config.CLIENT_ID });
    },

    // 마지막 인자가 콜백인 SDK 메서드는 전부 이걸로 부른다
    //   sdk.call('addCurrentProductToCart', mallId, time, appKey, memberId, hmac)
    // 실패는 항상 reject로 온다. .catch() 하나만 달면 된다
    call(method, ...args) {
      if (typeof CAFE24API === 'undefined') return Promise.reject(noSdk());
      if (typeof CAFE24API[method] !== 'function') {
        return Promise.reject(new Error(`[FRONT.api.sdk] CAFE24API.${method}() 가 없습니다.`));
      }
      return FRONT.util.toPromise((cb) => CAFE24API[method](...args, cb));
    },

    // 비로그인이면 null. 캐시도 재시도도 없다 — 보통은 FRONT.member.fetch() 를 쓴다
    customer() {
      return api.sdk
        .call('getCustomerInfo')
        .then((res) => res?.customer || null)
        .catch(() => null);
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

  // _run(무엇을 그릴까)과 has(스켈레톤을 띄울까)가 같은 기준을 써야 한다 — 한 곳에만 둔다
  const isExpired = (entry, maxAge) => !!maxAge && Date.now() - entry.time >= maxAge;

  // 바뀌었는지 비교할 때 쓸 지문. ignore에 준 이름은 깊이 상관없이 빼고 본다.
  // 요청할 때마다 값이 달라지는 필드(조회수처럼 우리 조회로 값이 올라가는 것)가
  // 섞여 있으면, 내용이 그대로인데도 매번 다시 그리게 된다
  const fingerprint = (value, ignore) =>
    (!ignore || !ignore.length)
      ? JSON.stringify(value)
      : JSON.stringify(value, (k, v) => (ignore.indexOf(k) > -1 ? undefined : v));

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
      return cache._run(key, fetcher, o);
    },

    _run(key, fetcher, { ttl, maxAge, onRevalidate, isValid, ignore }) {
      const entry = readEntry(key);

      const refetch = () => {
        if (inflight[key]) return inflight[key];
        inflight[key] = fetcher()
          .then((data) => {
            memory[key] = { data, time: Date.now() };
            writeSession(key, memory[key]);
            delete inflight[key];
            return data;
          })
          .catch((err) => {
            delete inflight[key];
            throw err;
          });
        return inflight[key];
      };

      if (!entry) return refetch();

      // 너무 오래됐다 — 그리지 않고 기다린다.
      // 못 받아오면 그때 가서 있는 것이라도 쓴다
      if (isExpired(entry, maxAge)) {
        FRONT.util.log('캐시가 maxAge 를 넘겨 새로 받는다:', key);
        return refetch().catch(() => entry.data);
      }

      if (Date.now() - entry.time >= ttl) {
        refetch()
          .then((fresh) => {
            if (!onRevalidate) return;
            // 응답이 늦게 왔는데 그 사이 화면이 바뀌었으면 그리지 않는다
            if (isValid && !isValid()) return;
            if (fingerprint(fresh, ignore) === fingerprint(entry.data, ignore)) return;
            onRevalidate(fresh);
          })
          .catch(() => {}); // 백그라운드 실패는 조용히 넘긴다. 화면엔 이미 캐시가 떠 있다
      }
      return Promise.resolve(entry.data);
    },

    /* 화면에 살아 있는 조회들을 다시 확인한다.
       ttl이 안 지난 것은 _run이 알아서 그냥 캐시를 돌려주고 끝나므로,
       여기서 나이를 따로 볼 필요가 없다. 같은 키로 이미 나간 요청이 있으면
       inflight이 합쳐준다 — 이벤트가 겹쳐 들어와도 요청은 한 번만 나간다 */
    revalidateAll() {
      let n = 0;
      live.forEach(({ key, fetcher, opts }) => {
        // 호출부가 '아직 이 화면이 맞나'를 판단할 수 있으면 존중한다
        if (opts.isValid && !opts.isValid()) return;
        n++;
        // maxAge 는 첫 렌더에서 '무엇을 그릴까'를 정하는 규칙이다.
        // 여기선 화면에 이미 내용이 떠 있으므로 꺼야 한다 — 켜두면 _run 이
        // 그냥 refetch 만 하고 onRevalidate 를 안 불러, 오래 자리를 비웠던
        // 사람일수록 화면이 안 바뀐다
        cache._run(key, fetcher, { ...opts, maxAge: 0 })
          .catch(() => {});   // 화면엔 이미 캐시가 떠 있다. 조용히 넘긴다
      });
      FRONT.util.log('재검증 대상 ' + n + '건');
      return n;
    },

    // 키를 주면 하나만, 안 주면 전부.
    // 살아 있는 조회 목록도 같이 정리한다 — 안 그러면 비워놓은 캐시를
    // 다음 탭 복귀 때 유령 등록이 도로 채운다
    clear(key) {
      if (key) {
        delete memory[key];
        try { sessionStorage.removeItem(PREFIX + key); } catch (e) {}
        live.forEach((v, fn) => { if (v.key === key) live.delete(fn); });
        return;
      }
      live.clear();
      Object.keys(memory).forEach((k) => delete memory[k]);
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.indexOf(PREFIX) === 0)
          .forEach((k) => sessionStorage.removeItem(k));
      } catch (e) {}
    },


    /* '지금 그릴 수 있는 값이 있나'를 묻는 것이다. 호출부는 전부
       if (!has(key)) 스켈레톤 으로 쓴다.

       maxAge 를 넘긴 캐시는 _run 이 그리지 않고 새로 받을 때까지 기다린다.
       그런데 여기서 true 를 주면 호출부가 스켈레톤을 감춰버려, 정작 기다리는
       동안 빈 자리가 남는다 — 스켈레톤이 가장 필요한 순간에 없어지는 셈이다.
       그래서 나이도 같이 본다. 기준은 _run 과 같아야 하므로 인자로 받는다 */
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

     visibilitychange 와 focus 는 복귀 때 같이 뜬다. inflight 이 요청은 하나로
     합쳐주지만 콜백까지 합쳐주진 않는다 — _run 이 그 하나의 약속에 저마다
     .then(onRevalidate) 을 매달아서, 요청 한 번에 onRevalidate 가 두 번 불렸다.
     다시 그리며 이전 것을 부수는 렌더(스와이퍼를 destroy 하고 다시 만드는 것 등)는
     두 번 돌면 깨진다. 그래서 요청이 아니라 트리거 쪽에서 합친다 */
  const WAKE_MERGE = 50;   // 같은 복귀에서 온 이벤트끼리만 묶일 만큼 짧게
  let wakeTimer = null;

  const wake = (why) => {
    if (document.visibilityState === 'hidden') return;
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      FRONT.util.log('재검증 트리거:', why);
      cache.revalidateAll();
    }, WAKE_MERGE);
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
            member.info = customer;
            const slim = {};
            FIELDS.forEach((k) => { if (customer[k] != null) slim[k] = customer[k]; });
            FRONT.util.cookie.setJSON(COOKIE_KEY, slim, COOKIE_MIN);
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
      // SDK가 없다 = 판단 불가. 캐시를 건드리지 않고 다음 기회로 미룬다
      if (!ready) { verified = false; return; }

      const actual = guest ? null : (customer && customer.member_id) || null;

      // 로그인인데 member_id가 아직 비어 있는 과도기. 역시 판단 불가
      if (!guest && !actual) { verified = false; return; }

      if (actual === cachedId) return;

      FRONT.util.log('member 캐시 불일치 — 캐시:', cachedId, '실제:', actual);
      member.clear();           // verified 는 건드리지 않는다 — 이 페이지에서 재검증이 돌지 않는다
      if (actual) fromSdk();    // 계정이 바뀐 경우 새 회원으로 다시 채운다
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

/* --- category ------------------------------------------------------ */
(() => {
  // parentNo별 로더. util.once가 "성공은 캐시, 실패는 재시도"를 맡는다
  const loaders = {};

  const category = {
    // 하위 카테고리 목록. parentNo별로 캐시된다
    //   FRONT.category.list(115).then((list) => ...)
    list(parentNo, limit = 100) {
      const key = `${parentNo}:${limit}`;
      loaders[key] = loaders[key] || FRONT.util.once(() =>
        FRONT.api.front
          .get('/api/v2/categories', { parent_category_no: parentNo, limit })
          .then((res) => res.data?.categories || []));
      return loaders[key]();
    },

    // 이름이 정확히 일치하는 하위 카테고리. 없으면 null
    //   FRONT.category.findByName('브랜드명', 115).then((c) => c && c.category_no)
    findByName(name, parentNo, limit) {
      const target = String(name ?? '').trim();
      if (!target) return Promise.resolve(null);
      return category
        .list(parentNo, limit)
        .then((list) => list.find((c) => c.category_name === target) || null);
    },
  };

  FRONT.category = category;
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
      console.error(`[FRONT.page${typeof entry.when === 'string' ? ' ' + entry.when : ''}]`, err);
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
