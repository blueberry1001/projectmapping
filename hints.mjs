const picker = document.querySelector('#area-select');
const page = document.querySelector('#hint-page');
const status = document.querySelector('#hint-status');
const colors = ['#077852', '#0d79be', '#82731e', '#554b86', '#ca4465', '#626262'];
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
async function readJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('load');
  return response.json();
}

try {
  const [data, entry] = await Promise.all([readJson('./hints.json'), readJson('./data/entry.json')]);
  // 本編でまだ到達していないArea数を、ヒントのメニューから明かさない。
  let available = 1;
  try {
    const progress = JSON.parse(localStorage.getItem(`projectmapping:${entry.version}`));
    if (progress) {
      const solved = Array.isArray(progress.solved) ? progress.solved : [];
      for (let number = 1; number <= 4; number++) {
        if (!solved.includes(`step${number}`)) break;
        available = number + 1;
      }
      if (progress.bonusStarted) available = 6;
    }
  } catch { /* 保存が使えない場合はArea1から表示。専用URLは常に利用可能。 */ }
  const requested = Number(new URL(location.href).searchParams.get('area'));
  if (Number.isInteger(requested) && requested >= 1 && requested <= 6) available = Math.max(available, requested);
  const areas = data.areas.filter(area => area.id <= available);
  for (const area of areas) {
    const option = node('option', area.title);
    option.value = area.id;
    picker.append(option);
  }
  function render(id) {
    const area = areas.find(item => item.id === Number(id)) || areas[0];
    picker.value = area.id;
    document.documentElement.style.setProperty('--area', colors[area.id - 1]);
    document.title = `${area.title} ヒント | Projectmapping`;
    const title = node('h2', `${area.title} ヒント`);
    title.id = 'area-title';
    page.replaceChildren(title);
    for (const problem of area.problems) {
      const details = node('details', '', 'problem');
      details.append(node('summary', problem.title));
      const items = node('div', '', 'hint-items');
      for (const item of problem.items) {
        if (!item.label) {
          items.append(node("p", item.text, "hint-text"));
          continue;
        }
        const hint = node('details', '', `hint-item${item.answer ? ' answer' : ''}`);
        hint.append(node('summary', item.label), node('p', item.text));
        items.append(hint);
      }
      details.append(items);
      page.append(details);
    }
    const url = new URL(location.href);
    url.searchParams.set('area', area.id);
    history.replaceState(null, '', url);
  }
  render(areas.some(area => area.id === requested) ? requested : available);
  picker.disabled = false;
  picker.addEventListener('change', () => render(picker.value));
  status.textContent = '';
} catch {
  status.textContent = 'ヒントを読み込めませんでした。ページを再読み込みしてください。';
}
