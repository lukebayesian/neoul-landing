/* global window, document, AbortController */
(function () {
  const endpoint = window.CUSTOMER_ENDPOINT || '';
  const dashboard = document.querySelector('#dashboard');
  const form = document.querySelector('#key-form');
  const error = document.querySelector('#key-error');
  const button = document.querySelector('#load');

  // 문항별 보기: [저장 값, 화면 이름]. index.html 과 apps-script/Code.gs 의 값과 같아야 한다.
  const scores = [['5', '5 아주 좋음'], ['4', '4 좋음'], ['3', '3 보통'], ['2', '2 별로'], ['1', '1 나쁨']];
  const questions = {
    visits: [['처음', '1회 이하'], ['2~3회', '2~3회'], ['4~6회', '4~6회'], ['7회 이상', '7회 이상']],
    channel: [['지나가다', '지나가다'], ['지인 소개', '지인 소개'], ['SNS', 'SNS'], ['인터넷 검색', '인터넷 검색'], ['기타', '기타']],
    reason: [['바 분위기', '바 분위기'], ['술·칵테일 맛', '술·칵테일 맛'], ['직원·사장 응대', '직원·사장 응대'], ['손님끼리 교류', '손님끼리 교류'], ['가격', '가격'], ['위치', '위치']],
    cocktail: scores.concat([['안 마심', '안 마심']]),
    mood: scores,
    revisit: [['꼭 올게요', '꼭 올게요'], ['아마 올 것', '아마 올 것'], ['모르겠음', '모르겠음'], ['안 올 것', '안 올 것']],
    improve: [['메뉴', '술·칵테일 메뉴'], ['가격', '가격'], ['분위기', '분위기'], ['단골 혜택', '이벤트·단골 혜택'], ['응대', '직원·사장 응대'], ['없음', '지금도 좋아요']],
  };

  function add(parent, tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined && text !== '') element.textContent = text;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }

  const sum = (counts, values) => values.reduce((total, value) => total + (counts[value] || 0), 0);
  const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const SCORE_VALUES = ['1', '2', '3', '4', '5'];

  function average(counts) {
    const n = sum(counts, SCORE_VALUES);
    if (!n) return null;
    return SCORE_VALUES.reduce((total, v) => total + Number(v) * (counts[v] || 0), 0) / n;
  }

  function tile(parent, label, value, detail) {
    const box = add(parent, 'div', '', 'tile');
    add(box, 'span', label, 'tile-label');
    add(box, 'strong', value);
    add(box, 'span', detail, 'tile-detail');
  }

  function bar(parent, count, whole, series) {
    const row = add(parent, 'div', '', 'bar-row');
    const track = add(row, 'div', '', 'bar-track');
    const fill = add(track, 'i', '', series || '');
    fill.style.width = `${percent(count, whole)}%`;
    add(row, 'span', `${count}명 · ${percent(count, whole)}%`, 'bar-value');
    row.title = `${whole}명 중 ${count}명`;
  }

  // 가로 막대. sorted 는 순서가 의미 없는 문항을 많은 순으로 보여 줄 때 쓴다.
  function chart(parent, title, key, counts, sorted) {
    const card = add(parent, 'section', '', 'card');
    add(card, 'h2', title);
    const whole = sum(counts, questions[key].map(([value]) => value));
    const options = questions[key].slice();
    if (sorted) options.sort((a, b) => (counts[b[0]] || 0) - (counts[a[0]] || 0));
    options.forEach(([value, label]) => {
      add(card, 'p', label, 'bar-label');
      bar(card, counts[value] || 0, whole);
    });
  }

  // 방문 이유를 3회 이하 손님과 4회 이상 손님으로 나눠 비교한다.
  function compare(parent, groups) {
    const card = add(parent, 'section', '', 'card');
    add(card, 'h2', '단골은 무엇 때문에 올까');
    const legend = add(card, 'div', '', 'legend');
    add(legend, 'span', `3회 이하 (${groups.light.total}명)`, 'key-a');
    add(legend, 'span', `4회 이상 (${groups.regular.total}명)`, 'key-b');
    questions.reason.forEach(([value, label]) => {
      add(card, 'p', label, 'bar-label');
      bar(card, groups.light.reason[value] || 0, groups.light.total, 'series-a');
      bar(card, groups.regular.reason[value] || 0, groups.regular.total, 'series-b');
    });
    const small = Math.min(groups.light.total, groups.regular.total) < 10;
    add(card, 'p', small
      ? '한 쪽 손님이 10명보다 적어 아직 비교하기 어렵습니다.'
      : '차이는 관련성일 뿐, 그 이유가 단골을 만든다는 증거는 아닙니다.', 'note');
  }

  // 시작 전에 정한 기준(3점 이하가 30%를 넘으면 점검)에 비춰 알려 준다.
  function judge(parent, label, counts) {
    const n = sum(counts, SCORE_VALUES);
    const low = sum(counts, ['1', '2', '3']);
    const share = percent(low, n);
    const over = n > 0 && share > 30;
    const text = !n ? '응답 없음' : over ? '⚠ 점검 필요' : '✓ 유지';
    const row = add(parent, 'li', '', over ? 'over' : '');
    add(row, 'span', `${label}: 3점 이하 ${share}% (${low}/${n}명)`);
    add(row, 'strong', text);
  }

  function render(data, isDemo) {
    dashboard.textContent = '';
    const { total, counts, groups } = data;
    if (isDemo) add(dashboard, 'p', '예시 데이터입니다. 실제 손님 응답이 아닙니다.', 'demo-banner');
    if (!total) {
      add(dashboard, 'p', '아직 응답이 없습니다.', 'note');
      return;
    }
    if (total < 30) add(dashboard, 'p', `응답 ${total}건입니다. 30건보다 적으면 방향만 참고하세요.`, 'warning');

    const tiles = add(dashboard, 'div', '', 'tiles');
    const cocktail = average(counts.cocktail);
    const mood = average(counts.mood);
    const revisit = sum(counts.revisit, ['꼭 올게요', '아마 올 것']);
    const regular = sum(counts.visits, ['4~6회', '7회 이상']);
    tile(tiles, '응답 수', `${total}건`, '익명 응답');
    tile(tiles, '칵테일 만족도', cocktail === null ? '-' : `${cocktail.toFixed(1)}점`, `5점 만점 · ${sum(counts.cocktail, SCORE_VALUES)}명`);
    tile(tiles, '분위기 만족도', mood === null ? '-' : `${mood.toFixed(1)}점`, `5점 만점 · ${sum(counts.mood, SCORE_VALUES)}명`);
    tile(tiles, '다시 올 의향', `${percent(revisit, total)}%`, `${revisit}명이 긍정`);
    tile(tiles, '단골 비율', `${percent(regular, total)}%`, `3개월 4회 이상 ${regular}명`);

    const checks = add(dashboard, 'section', '', 'card');
    add(checks, 'h2', '바로 점검할 것');
    const list = add(checks, 'ul', '', 'checks');
    judge(list, '칵테일', counts.cocktail);
    judge(list, '분위기', counts.mood);
    add(checks, 'p', '기준(30%)은 제안값입니다. 설문을 시작하기 전에 정하고 바꾸지 마세요.', 'note');

    chart(dashboard, '손님이 온 가장 큰 이유', 'reason', counts.reason, true);
    compare(dashboard, groups);
    chart(dashboard, '더 자주 오려면', 'improve', counts.improve, true);
    chart(dashboard, '너울을 알게 된 경로', 'channel', counts.channel, true);
    chart(dashboard, '최근 3개월 방문 횟수', 'visits', counts.visits);
    chart(dashboard, '칵테일 평가', 'cocktail', counts.cocktail);
    chart(dashboard, '분위기 평가', 'mood', counts.mood);
    chart(dashboard, '한 달 안에 다시 올까', 'revisit', counts.revisit);
    add(dashboard, 'p', '매장에 온 손님만 답한 결과입니다. 오지 않는 사람의 생각은 담기지 않습니다.', 'note');
  }

  // 화면 설명용으로 지어낸 숫자. 반드시 "예시 데이터" 표시와 함께만 보여 준다.
  const demoData = {
    total: 40,
    counts: {
      visits: { '처음': 14, '2~3회': 12, '4~6회': 9, '7회 이상': 5 },
      channel: { '지나가다': 11, '지인 소개': 15, SNS: 8, '인터넷 검색': 4, '기타': 2 },
      reason: { '바 분위기': 13, '술·칵테일 맛': 10, '직원·사장 응대': 7, '손님끼리 교류': 6, '가격': 1, '위치': 3 },
      cocktail: { 5: 12, 4: 15, 3: 8, 2: 2, '안 마심': 3 },
      mood: { 5: 18, 4: 16, 3: 5, 2: 1 },
      revisit: { '꼭 올게요': 16, '아마 올 것': 15, '모르겠음': 7, '안 올 것': 2 },
      improve: { '메뉴': 9, '가격': 8, '분위기': 3, '단골 혜택': 12, '응대': 1, '없음': 7 },
    },
    groups: {
      light: { total: 26, reason: { '바 분위기': 11, '술·칵테일 맛': 6, '직원·사장 응대': 3, '손님끼리 교류': 2, '가격': 1, '위치': 3 } },
      regular: { total: 14, reason: { '바 분위기': 2, '술·칵테일 맛': 4, '직원·사장 응대': 4, '손님끼리 교류': 4 } },
    },
  };

  document.querySelector('#demo').addEventListener('click', () => {
    error.textContent = '';
    render(demoData, true);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    dashboard.textContent = '';
    const key = form.elements.key.value;
    if (!endpoint) {
      error.textContent = '저장 주소가 아직 설정되지 않았습니다. 예시 데이터로 화면을 확인해 보세요.';
      return;
    }
    if (!key) {
      error.textContent = '암호를 입력해 주세요.';
      return;
    }
    button.disabled = true;
    button.textContent = '불러오는 중…';
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      // 암호가 주소(URL)에 남지 않도록 POST 본문으로 보낸다.
      const response = await window.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'results', key }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (result.ok) render(result, false);
      else error.textContent = result.error === 'key' ? '암호가 맞지 않습니다.' : '결과를 불러오지 못했습니다.';
    } catch {
      error.textContent = '결과를 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.';
    } finally {
      window.clearTimeout(timer);
      button.disabled = false;
      button.textContent = '결과 보기';
    }
  });
})();
