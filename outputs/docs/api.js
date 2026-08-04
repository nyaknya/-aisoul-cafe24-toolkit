/* ===================================================================
   FRONT.api — API 통신

   axios(CDN)가 전역에 있어야 한다.
   인스턴스는 첫 요청 때 만들어진다. 번들이 CDN보다 먼저 실행되는 경우가
   있어서 최상위에서 axios.create() 를 부르면 안 되기 때문이다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const resolve = (v) => (typeof v === 'function' ? v() : v);

  // opts: { name, baseURL, headers, token, ...그 외 axios 옵션 }
  //   baseURL / headers 는 함수로 넘기면 첫 요청 때 평가된다 (config 로드 순서 무관)
  //   token 은 문자열 또는 함수. 있으면 Authorization: Bearer 로 붙는다
  //   나머지(timeout, withCredentials, responseType …)는 axios로 그대로 전달된다.
  //   키트가 아는 옵션만 화이트리스트로 받으면, 옵션 하나 쓰려고 raw()로
  //   인스턴스를 꺼내 defaults를 직접 만지는 상황이 생긴다.
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

      // Content-Type을 여기서 고정하지 않는다.
      // axios가 본문 종류를 보고 정한다 — 객체면 application/json,
      // FormData면 boundary가 포함된 multipart/form-data.
      // 직접 'multipart/form-data' 를 박으면 boundary가 빠져서 서버가 못 읽는다.
      inst = axios.create({ ...axiosOpts, baseURL: url, headers: resolve(headers) });

      inst.interceptors.request.use((cfg) => {
        const t = resolve(auth);
        if (t) cfg.headers.Authorization = `Bearer ${t}`;
        return cfg;
      });

      return inst;
    };

    const api = {
      // get('/path', { page: 1 })  ← 두 번째 인자가 쿼리스트링
      get(url, params, config) {
        return client().get(url, { params, ...config });
      },
      post(url, data, config) {
        return client().post(url, data, config);
      },
      put(url, data, config) {
        return client().put(url, data, config);
      },
      patch(url, data, config) {
        return client().patch(url, data, config);
      },
      delete(url, config) {
        return client().delete(url, config);
      },

      // 토큰을 나중에 넣거나 바꿀 때. 문자열도 함수도 받는다
      setToken(v) {
        auth = v;
        return api;
      },

      // axios 인스턴스가 직접 필요할 때 (인터셉터 추가 등)
      raw: client,
    };

    return api;
  };

  /* -------------------------------------------------------------
     카페24 프론트에서 쓰는 통신은 세 갈래다.

       FRONT.api.middleware  자체 백엔드          우리 토큰
       FRONT.api.front       카페24 프론트 API    client_id 헤더
       FRONT.api.sdk         카페24 JS SDK        카페24 세션 (콜백)

     그 외 인증 방식이 필요하면 create() 로 직접 만든다.
       const custom = FRONT.api.create({ name: '...', baseURL: '...', token: '...' });
  ------------------------------------------------------------- */

  const api = {
    create,

    // 자체 백엔드(중계 서버)
    // 인증이 필요하면 FRONT.api.middleware.setToken(() => ...) 로 붙인다
    middleware: create({
      name: '미들웨어',
      baseURL: () => FRONT.config.MIDDLEWARE_BASE,
    }),

    // 카페24 프론트 API — client_id 헤더로 부른다 (카테고리 조회 등)
    front: create({
      name: '카페24 프론트 API',
      baseURL: () => FRONT.config.CAFE24_BASE,
      headers: () => ({ 'X-Cafe24-Client-Id': FRONT.config.CLIENT_ID }),
    }),
  };

  const noSdk = () =>
    new Error('[FRONT.api.sdk] CAFE24API가 없습니다. 카페24 앱 스크립트가 로드됐는지 확인하세요.');

  // 카페24 자바스크립트 SDK(CAFE24API)를 Promise로 감싼 것.
  // SDK는 전부 콜백 방식이다 —
  //   CAFE24API.addCurrentProductToCart(mall_id, request_time, app_key, member_id, hmac, callback)
  //
  // 실패는 전부 reject로 통일한다. 일부는 throw, 일부는 reject로 나가면
  // 호출부가 try/catch와 .catch()를 둘 다 써야 하고, 하나를 빠뜨리면
  // FRONT.page의 try/catch가 삼켜서 "처리된 것처럼 보이는" 실패가 된다.
  api.sdk = {
    // SDK를 client_id로 초기화한다. 쓰기 전에 한 번 부른다.
    // 이건 Promise를 돌려주지 않으므로 throw가 맞다
    init() {
      if (typeof CAFE24API === 'undefined') throw noSdk();
      return CAFE24API.init({ client_id: FRONT.config.CLIENT_ID });
    },

    // 마지막 인자가 콜백인 SDK 메서드는 전부 이걸로 부른다
    //   FRONT.api.sdk.call('addCurrentProductToCart', mallId, time, appKey, memberId, hmac)
    call(method, ...args) {
      if (typeof CAFE24API === 'undefined') return Promise.reject(noSdk());
      if (typeof CAFE24API[method] !== 'function') {
        return Promise.reject(new Error(`[FRONT.api.sdk] CAFE24API.${method}() 가 없습니다.`));
      }
      return FRONT.util.toPromise((cb) => CAFE24API[method](...args, cb));
    },

    // 로그인 회원 정보. 비로그인이거나 권한 없으면 null.
    //
    // 주의: 캐시도 재시도도 없는 날것이다. 보통은 FRONT.member.fetch() 를 쓴다.
    // 여기서는 "비로그인"과 "아직 안 채워짐"이 똑같이 null이 되므로,
    // FRONT.member 는 이걸 쓰지 못하고 call() 을 직접 부른다.
    customer() {
      return api.sdk
        .call('getCustomerInfo')
        .then((res) => res?.customer || null)
        .catch(() => null);
    },

    cartCount() {
      return api.sdk.call('getCartCount');
    },

    couponCount() {
      return api.sdk.call('getCouponCount');
    },
  };

  FRONT.api = api;
})();
