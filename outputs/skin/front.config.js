/* ===================================================================
   front.config.js — 몰마다 고치는 파일

   새 프로젝트에서 손대는 건 이 파일 하나뿐이다.
   front.core.js 는 건드리지 않는다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const config = {
    // 카페24 몰 아이디
    MALL_ID: 'yourmallid',

    // 카페24 앱 client_id. 프론트 API / SDK 호출에 쓴다
    CLIENT_ID: '',

    // 자체 백엔드(중계 서버) 주소. 안 쓰면 빈 문자열
    MIDDLEWARE_BASE: '',

    // 스킨 경로 접두사. 멀티스킨이 아니면 빈 문자열
    SKIN_BASE: '',

    // 기본 꺼짐. 주소에 ?debug=1 을 붙이면 그 페이지에서만 켜진다
    DEBUG: /[?&]debug=1/.test(location.search),
  };

  // MALL_ID 에서 자동으로 만들어진다. 고칠 일 없음
  config.CAFE24_BASE = `https://${config.MALL_ID}.cafe24api.com`;

  if (config.MALL_ID === 'yourmallid') {
    console.warn('[FRONT.config] MALL_ID가 기본값입니다. 몰 아이디로 바꿔주세요.');
  }

  /* -----------------------------------------------------------------
     셀렉터 — 마크업이 바뀌면 여기만 고친다.
     페이지 파일 여기저기에 클래스명을 흩어놓지 말 것.

       FRONT.sel.orderList  →  '.order-list'
  ----------------------------------------------------------------- */
  const sel = {
    // orderList: '.order-list',
    // orderItem: '.order-item',
  };

  FRONT.config = config;
  FRONT.sel = sel;
})();
