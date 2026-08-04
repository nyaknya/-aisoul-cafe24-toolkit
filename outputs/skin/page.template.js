/* ===================================================================
   페이지 스크립트 템플릿 — 복사해서 시작한다.
   맨 위 두 줄은 지우지 말 것. (이 파일이 공통 코어보다 먼저 실행돼도 동작하게 함)
=================================================================== */
window.FRONT = window.FRONT || {};
FRONT.page = FRONT.page || function () { (FRONT._q = FRONT._q || []).push(arguments); };

FRONT.page(function () {
  const { formatNumber, onError, log } = FRONT.util;

  log('마이페이지 시작');

  FRONT.api.middleware
    .get('/api/v1/mypage/benefits', { mallId: FRONT.config.MALL_ID })
    .then(function (res) {
      $('.benefit-total').text(formatNumber(res.data.total) + '원');
    })
    .catch(onError('마이페이지 혜택'));
});
