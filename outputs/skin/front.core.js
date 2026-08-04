/* ===================================================================
   front.core.js — 카페24 프론트 공통. 이 파일은 고치지 않는다.
   설정은 front.config.js, 사용법과 이유는 README 참고.
=================================================================== */
window.FRONT = window.FRONT || {};
FRONT.page = FRONT.page || function () { (FRONT._q = FRONT._q || []).push(arguments); };

/* --- util ---------------------------------------------------------- */
(() => {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

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
  };

  FRONT.util = util;
})();

/* --- api ----------------------------------------------------------- */
(() => {
  const resolve = (v) => (typeof v === 'function' ? v() : v);

  // baseURL / headers 는 함수로 넘기면 첫 요청 때 평가된다.
  // 그 외 옵션(timeout, withCredentials 등)은 axios로 그대로 넘어간다
  const create = ({ name = 'API', baseURL, headers, token, ...axiosOpts } = {}) => {
    let inst = null;
    let auth = token || null;

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

    // 인증이 필요하면 FRONT.api.middleware.setToken(() => ...) 로 붙인다
    middleware: create({
      name: '미들웨어',
      baseURL: () => FRONT.config.MIDDLEWARE_BASE,
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
          if (guest) return resolve(null);

          if (customer?.member_id) {
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

  const member = {
    // 마지막으로 조회된 회원 정보. 조회 전이면 null
    info: null,

    // 로그인 회원 정보를 Promise로. 비로그인이면 null
    // 쿠키 캐시(30분) → 없으면 SDK 조회. 동시에 여러 번 불러도 요청은 한 번
    fetch() {
      if (member.info?.member_id) return Promise.resolve(member.info);

      const cached = FRONT.util.cookie.getJSON(COOKIE_KEY);
      if (cached?.member_id) {
        member.info = cached;
        return Promise.resolve(cached);
      }
      return fromSdk();
    },

    // 로그아웃 링크에 걸어둔다. 캐시를 안 지우면 로그아웃 후에도 남는다
    clear() {
      member.info = null;
      promise = null;
      FRONT.util.cookie.remove(COOKIE_KEY);
    },
  };

  FRONT.member = member;
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
