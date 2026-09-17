/* ===================================================================
   FRONT.util — 공통 유틸
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  // 토스트는 한 번에 하나만 뜬다. 앞의 것을 지울 타이머를 밖에 둔다
  let toastTimer = null;

  // 아이콘은 인라인 SVG다. 이미지 파일로 두면 스킨마다 경로를 맞춰야 하고,
  // 첫 토스트에서 아이콘만 늦게 뜬다. 색은 front.core.css 가 준다
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
    /* --- 포맷 ------------------------------------------------- */

    // 1000 → '1,000'
    formatNumber(n) {
      return Number(n || 0).toLocaleString();
    },

    // '2026-08-04T12:00:00' → '2026.08.04'
    formatDate(s) {
      return String(s || '').slice(0, 10).replace(/-/g, '.');
    },

    // 사용자 입력을 innerHTML/html()에 넣기 전에 반드시 통과시킬 것
    escapeHtml(v) {
      return String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
    },

    // '옵션A, 옵션B' → '<p class="opt">옵션A<br>옵션B</p>' (빈 값이면 '')
    listToHtml(value, className = '') {
      const parts = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return '';
      const rows = parts.map((p) => util.escapeHtml(p)).join('<br>');
      return `<p class="${className}">${rows}</p>`;
    },

    /* --- URL -------------------------------------------------- */

    // 현재 주소의 ?cate_no=125 → util.query('cate_no') → '125'
    // 두 번째 인자로 다른 URL을 넘길 수도 있다
    query(key, url) {
      const search = url ? url.split('?')[1] || '' : location.search;
      return new URLSearchParams(search).get(key);
    },

    /* 스킨 경로 접두사(config.SKIN_BASE)를 붙인다.

       멀티스킨에서는 같은 몰에 스킨이 여러 벌 올라가 있고, 주소의 접두사가
       그걸 가른다. 작업 스킨에서 '/pages/list.html' 로 링크를 걸면 라이브 스킨으로
       튀어버린다 — 화면은 멀쩡해 보이는데 바뀐 코드가 안 보이는 상태가 된다.

         util.url('/mypage/list.html') → '/skin-skin2/mypage/list.html'

       이미 접두사가 붙은 경로는 그대로 둔다. 두 번 붙으면 404다 */
    url(path) {
      const base = String(FRONT.config?.SKIN_BASE || '').replace(/^\/|\/$/g, '');
      const p = String(path || '');
      if (!base) return p;
      const pre = '/' + base;
      if (p === pre || p.indexOf(pre + '/') === 0) return p;
      return pre + (p.charAt(0) === '/' ? p : '/' + p);
    },

    /* --- 쿠키 ------------------------------------------------- */

    cookie: {
      get(key) {
        const m = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
        return m ? decodeURIComponent(m[1]) : null;
      },
      set(key, value, minutes = 30) {
        const expires = new Date(Date.now() + minutes * 60000).toUTCString();
        document.cookie = `${key}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
      },
      // set을 재사용한다. 쿠키 속성(path 등)을 쓰는 곳이 한 군데여야
      // 나중에 domain이나 SameSite가 붙었을 때 지우기가 같이 따라간다
      remove(key) {
        util.cookie.set(key, '', -1);
      },

      // 객체를 JSON으로 저장/복원. 값이 없거나 깨졌으면 null
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

    /* --- 흐름 제어 -------------------------------------------- */

    // 결과를 한 번만 계산해서 재사용. 실패하면 다음 호출에서 다시 시도한다.
    //   const loadCategories = util.once(() => FRONT.api.cafe24Public.get('/api/v2/categories'));
    //   loadCategories().then(...)   // 두 번째부터는 요청 안 나감
    once(fn) {
      let has = false;
      let cached;
      return (...args) => {
        if (has) return cached;
        cached = fn(...args);
        has = true;
        if (cached && typeof cached.then === 'function') {
          cached.catch(() => {
            has = false;
            cached = undefined;
          });
        }
        return cached;
      };
    },

    // 마지막 호출만 wait(ms) 뒤에 실행. 스크롤·입력 핸들러용
    debounce(fn, wait = 200) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },

    // 카페24 SDK의 콜백 방식을 Promise로 변환
    //   util.toPromise((cb) => CAFE24API.getCustomerInfo(cb)).then(...)
    toPromise(fn) {
      return new Promise((resolve, reject) =>
        fn((err, res) => (err ? reject(err) : resolve(res))),
      );
    },

    /* --- 배열 ------------------------------------------------- */

    // 입력 순서를 보존하며 그룹핑 → { map, keys }
    //   util.groupBy(items, 'shippingGroup')
    //   util.groupBy(items, (it) => it.shippingGroup)
    groupBy(list, keyOf) {
      const map = {};
      const keys = [];
      (list || []).forEach((item) => {
        const key = (typeof keyOf === 'function' ? keyOf(item) : item[keyOf]) ?? 'NONE';
        if (!map[key]) {
          map[key] = [];
          keys.push(key);
        }
        map[key].push(item);
      });
      return { map, keys };
    },

    /* --- 화면 ------------------------------------------------- */

    /* 로딩 중 카드 자리를 채우는 마크업.

       응답을 기다리는 동안 빈 화면을 두면 내용이 도착하는 순간 레이아웃이 튄다.
       자리의 크기·배치는 몰 CSS 가 정하고, 여기서는 구조만 만든다.
       반짝임은 front.core.css 의 .skeleton-block

         FRONT.util.skeleton(8, 'card-skeleton', [
           { className: 'img' }, { className: 'title' }, { className: 'desc' },
         ]) */
    skeleton(count, wrapperClass, blocks) {
      const inner = blocks.map((b) => `<div class="skeleton-block ${b.className}"></div>`).join('');
      return `
        <li class="${wrapperClass}">
          ${inner}
        </li>`.repeat(Math.max(0, count));
    },

    /* 같은 컨테이너를 다시 그리기 전에 Swiper 를 정리한다.

       클래스로 찾으면 안 된다. Swiper 6+ 는 .swiper-initialized 를 붙이지만
       4.x 는 .swiper-container-initialized 를 붙인다 — 카페24 스킨에는 아직
       4.x 가 흔하다. 인스턴스는 버전과 무관하게 el.swiper 에 들어 있으니 그걸로 찾는다.
       destroy 하지 않고 다시 그리면 이전 인스턴스가 사라진 DOM 을 붙잡은 채 남는다 */
    destroySwipers($scope) {
      $scope.find('[class*="swiper"]').addBack().each(function () {
        if (this.swiper) this.swiper.destroy(true, true);
      });
    },

    /* 화면 하단에 잠깐 떴다 사라지는 알림.
       front.core.css 가 있어야 보인다. 없으면 마크업만 붙고 아무 일도 안 일어난다.

         util.toast('쿠폰이 발급되었어요')
         util.toast('이미 발급받은 쿠폰이에요', { type: 'error' })
         type: success | error | info,  duration: 기본 2000ms

       한 번에 하나만 띄운다. 여러 개를 쌓으면 어느 것이 방금 한 동작의 결과인지
       알기 어렵고, 연타했을 때 화면이 토스트로 덮인다 */
    toast(message, options) {
      const opt = options || {};
      const type = TOAST_ICON[opt.type] ? opt.type : 'success';   // 모르는 type 은 success 로

      clearTimeout(toastTimer);
      $('.front-toast').remove();

      // 메시지는 서버 문구나 사용자 입력일 수 있다. 반드시 escape 한다
      const $el = $(
        '<div class="front-toast front-toast--' + type + '" role="status" aria-live="polite">' +
          TOAST_ICON[type] +
          '<span>' + util.escapeHtml(message) + '</span>' +
        '</div>'
      ).appendTo('body');

      // 붙자마자 클래스를 주면 브라우저가 시작 상태를 못 잡아 트랜지션이 생략된다.
      // 다음 프레임에 준다
      requestAnimationFrame(() => $el.addClass('is-visible'));

      toastTimer = setTimeout(() => {
        $el.removeClass('is-visible');
        setTimeout(() => $el.remove(), 300);   // CSS transition 시간과 맞춘다
      }, opt.duration || 2000);
    },

    /* DOM ready 에 등록된 다른 코드가 전부 끝난 뒤로 미룬다.

       스킨에 원래 있던 공통 js 가 우리와 같은 컨테이너를 ready 에서 잡는 경우,
       누가 이기는지가 상황에 따라 뒤집힌다 — 캐시가 비어 우리 렌더가 늦으면
       우리가 마지막이고, 캐시가 맞아 우리가 먼저 그리면 저쪽이 덮어쓴다.
       첫 접속과 새로고침의 결과가 달라지는 종류의 버그다.

       setTimeout 0 은 ready 배치가 다 돈 뒤에 실행된다 — 항상 우리가 마지막이 된다 */
    afterReady(fn) {
      $(() => setTimeout(fn, 0));
    },

    /* --- 로그 ------------------------------------------------- */

    // config.DEBUG가 true일 때만 출력. 운영에 로그 남기고 배포해도 안전
    log(...args) {
      if (FRONT.config?.DEBUG) console.log('[FRONT]', ...args);
    },

    logError(label, err) {
      console.error(`[${label}]`, err);
    },

    // .catch(util.onError('주문목록')) 형태로 쓴다
    onError(label) {
      return (err) => util.logError(label, err);
    },
  };

  FRONT.util = util;
})();
