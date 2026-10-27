import { normalizeAnswer, checkAnswers, NORMALIZATION } from './shared/answers.mjs';
const $ = selector => document.querySelector(selector);
const colors = ['#077852', '#0d79be', '#bdaa3a', '#554b86', '#ca4465', '#ebebeb'];
const icons = {
  neutral: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
  correct: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  incorrect: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
};
let content, entry, storageKey, progress = { started:false, begun:false, solved:[], opened:[], answers:{} };
const rendered = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const el = (tag, className, text) => { const node = document.createElement(tag); if(className) node.className = className; if(text !== undefined) node.textContent = text; return node; };
function button(label, fn, className = 'primary') {
  const node = el('button', className, label); node.type = 'button';
  if (className.includes('primary')) node.append(el('span', 'arrow'));
  node.addEventListener('click', fn); return node;
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); }
  catch { $('#global-status').textContent = '進行状況を保存できません。このページを閉じずに続けてください。'; }
}
function show(node, focus = true) {
  if (!focus) return;
  requestAnimationFrame(() => { node.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block:'start' });
    const heading = node.querySelector('h2,h3'); if(heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
  });
}
async function json(path) { const response = await fetch(path, {cache:'no-store'}); if(!response.ok) throw new Error('load'); return response.json(); }
function media(config, parent) {
  const figure = el('div', 'area');
  const placeholder = () => figure.replaceChildren(el('div', 'area-placeholder', config.alt));
  if (config.src) { const img = el('img'); img.alt = config.alt; img.src = config.src; img.addEventListener('error', placeholder, {once:true}); figure.append(img); }
  else placeholder();
  parent.append(figure);
}

// Reveal complete speech bubbles in order; narration and instructions stay immediately visible.
const speechQueue = [];
let activeSpeech = null;
function advanceSpeech() {
  if (activeSpeech) return;
  const job = speechQueue.find(item => !item.done);
  if (!job || !job.ready) return;
  activeSpeech = job;
  job.node.classList.add('speech-visible');
  job.timer = setTimeout(() => { job.done=true; activeSpeech=null; advanceSpeech(); }, 320);
}
const speechObserver = new IntersectionObserver(entries => {
  for (const item of entries) {
    if (!item.isIntersecting) continue;
    const index = speechQueue.findIndex(job => job.node===item.target);
    for(let i=0;i<=index;i++) speechQueue[i].ready=true;
    speechObserver.unobserve(item.target);
  }
  advanceSpeech();
});
reducedMotion.addEventListener('change', () => {
  if (!reducedMotion.matches) return;
  for (const job of speechQueue) { clearTimeout(job.timer);job.done=true;job.node.classList.add('speech-visible'); }
  activeSpeech=null;speechObserver.disconnect();
});
function story(blocks, animate = true) {
  const body=el('div','chapter-body story');
  for(const block of typeof blocks==='string'?[{type:'paragraph',text:blocks}]:blocks) {
    if(block.type==='concepts') {
      const panel=el('div','concept-panel');
      for(const item of block.items) {
        const section=el('section','concept-item');
        section.append(el('h3','concept-title',item.title));
        for(const text of item.paragraphs) section.append(el('p','',text));
        if(item.image) media(item.image,section);
        panel.append(section);
      }
      body.append(panel);continue;
    }
    const node=el('p',block.type==='dialogue'?'story-dialogue':block.type==='notice'?'story-notice':'',block.text);
    if(block.type==='dialogue' && animate && !reducedMotion.matches) {
      node.classList.add('speech-pending');
      speechQueue.push({node,ready:false,done:false});speechObserver.observe(node);
    }
    body.append(node);
  }
  return body;
}

function renderIntro(scroll = true, animate = scroll) {
  if ($('#introduction')) return;
  const section = el('section', 'chapter introduction'); section.id = 'introduction';
  section.append(el('h2', 'chapter-heading', 'Prologue'), story(content.introduction, animate));
  if (content.introductionColor) section.querySelector('h2').style.color=content.introductionColor;
  const start = button('謎解きをはじめる', async () => {
    start.disabled = true;
    try { await renderStep(entry.first, true); progress.begun = true; save(); start.hidden = true; }
    catch { start.disabled = false; error.textContent = '読み込めませんでした。もう一度お試しください。'; }
  });
  const error = el('p', 'form-status'); error.setAttribute('role','status');
  start.hidden = progress.begun;
  section.append(start,error); $('#journey').append(section); show(section,scroll);
}
function row(index, treasure = false) {
  const wrap = el('div', 'answer-row' + (treasure ? ' treasure' : ''));
  const input = el('input'); input.type = 'text'; input.maxLength = 100; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('autocapitalize','off'); input.setAttribute('aria-label', treasure ? '宝のありか' : `答え ${index + 1}`);
  input.enterKeyHint = 'next'; input.required = true;
  const result = el('span','result'); result.innerHTML = icons.neutral;
  wrap.append(input,result); return wrap;
}
function renderForm(data, section, complete) {
  const form = el('form','answer-form'); form.noValidate = true;
  form.setAttribute('aria-label', `Area${data.number}の解答`);
  const fields = el('div','fields');
  for(let i=0;i<data.groups.length;i++) fields.append(row(i));
  form.append(fields);
  if(data.treasure) { form.append(el('p','treasure-label','宝のありか')); form.append(row(data.groups.length,true)); }
  const rows = [...form.querySelectorAll('.answer-row')], inputs = rows.map(r=>r.querySelector('input'));
  inputs.at(-1).enterKeyHint = 'done';
  const status = el('p','form-status'); status.id = `${data.id}-status`; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  inputs.forEach(input=>input.setAttribute('aria-describedby',status.id));
  const submit = el('button','primary','解答する'); submit.type = 'submit'; submit.append(el('span','arrow'));
  form.append(status,submit);
  if (progress.solved.includes(data.id)) {
    const saved = progress.answers[data.id];
    const hasAnswers = Array.isArray(saved) && saved.length === inputs.length &&
      saved.every(value => typeof value === 'string' && value.length <= 100);
    inputs.forEach((input, i) => {
      input.readOnly = true;
      if (!hasAnswers) return;
      input.value = saved[i];
      input.setAttribute('aria-invalid','false');
      rows[i].dataset.result = 'correct';
      const icon = rows[i].querySelector('.result');
      icon.innerHTML = icons.correct;
      icon.setAttribute('role','img'); icon.setAttribute('aria-label','正解');
    });
    if (!hasAnswers) status.textContent = 'この端末には以前の解答が保存されていません。';
    submit.hidden = true;
    section.append(form);
    return;
  }
  let busy = false, composing = false;
  function refresh() { submit.disabled = busy || composing; }
  form.addEventListener('compositionstart',()=>{composing=true;refresh();});
  form.addEventListener('compositionend',()=>{composing=false;refresh();});
  form.addEventListener('input', () => {
    // Unordered matching is collective: editing one row invalidates the previous allocation.
    rows.forEach(r=>{ delete r.dataset.result; const input=r.querySelector('input'); input.removeAttribute('aria-invalid'); r.querySelector('.result').innerHTML=icons.neutral; r.querySelector('.result').removeAttribute('aria-label'); });
    status.textContent = ''; refresh();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if(submit.disabled || busy || composing) return;
    const empty = inputs.find(input => !normalizeAnswer(input.value));
    if (empty) {
      const dialog = $('#incomplete-dialog');
      dialog.addEventListener('close', () => empty.focus(), { once:true });
      dialog.showModal();
      return;
    }
    busy = true; refresh(); inputs.forEach(i=>i.readOnly=true); submit.firstChild.textContent = '確認中…';
    try {
      const values = inputs.slice(0,data.groups.length).map(i=>i.value);
      const result = await checkAnswers(values,data.groups,inputs.at(-1).value,data.treasure);
      rows.forEach((r,i)=>{ const key=result[i]?'correct':'incorrect'; r.dataset.result=key; r.querySelector('input').setAttribute('aria-invalid',String(!result[i])); const icon=r.querySelector('.result'); icon.innerHTML=icons[key]; icon.setAttribute('role','img'); icon.setAttribute('aria-label',result[i]?'正解':'不正解'); });
      if(result.every(Boolean)) {
        status.textContent = ''; progress.answers[data.id] = inputs.map(input => input.value);
        progress.solved.push(data.id); save();
        submit.hidden = true; inputs.forEach(i=>i.readOnly=true); complete(true);
        return;
      }
      status.textContent = '';
    } catch { status.textContent = '判定できませんでした。もう一度お試しください。'; }
    finally { if(!progress.solved.includes(data.id)) { busy=false; inputs.forEach(i=>i.readOnly=false); submit.firstChild.textContent='解答する'; refresh(); } }
  });
  section.append(form);
}
async function renderStep(id, scroll = true) {
  if(rendered.has(id)) return;
  if(!/^step[1-9]\d*$/.test(id)) throw new Error('id');
  const data = await json(`./data/${id}.json`);
  if(data.algorithm!=='SHA-256'||data.normalization!==NORMALIZATION||!Array.isArray(data.groups)) throw new Error('schema');
  const copy = content.steps[id]; if(!copy) throw new Error('content');
  const section = el('section','chapter'); section.id=id; section.dataset.number=data.number;
  section.style.setProperty('--step',colors[(data.number-1)%colors.length]);
  if(data.number===3 || data.number===6) section.style.setProperty('--step-ink','#373431');
  if(data.number===6) section.classList.add('bonus');
  section.append(el('h2','chapter-heading',`Area${data.number}${data.number===6?'（おまけ）':''}`),story(copy.body, scroll));
  if (copy.headingColor) section.querySelector('h2').style.color=copy.headingColor;
  const complete = (animate = false) => {
    if(section.querySelector('.completion')) return;
    const completion = el('div','completion'); completion.append(el('p','complete-note','正解'));
    if(copy.area) media(copy.area,completion);
    if (copy.download) {
      const download = copy.download.url ? el('a','pending-link','A4印刷用データ') : el('p','pending-link',copy.download.label);
      if(copy.download.url) { download.href=copy.download.url;download.download=''; }
      completion.append(download);section.append(completion);return;
    }
    const status = el('p','form-status'); status.setAttribute('role','status');
    const next = button('次へ',async()=>{
      next.disabled = true; status.textContent='';
      try { if(data.next) await renderStep(data.next,true); else await renderClear(true);
        progress.opened.push(data.id); save(); next.hidden=true;
      } catch { status.textContent='読み込めませんでした。もう一度お試しください。';next.disabled=false; }
    },'primary continue');
    next.hidden=progress.opened.includes(data.id);
    completion.append(next,status); section.append(completion);
    if(animate) { completion.classList.add('reveal'); completion.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'nearest'}); }
  };
  renderForm(data,section,complete);
  if(progress.solved.includes(id)) complete();
  $('#journey').append(section); rendered.add(id); show(section,scroll);
  if(progress.solved.includes(id) && progress.opened.includes(id)) { if(data.next) await renderStep(data.next,false); else if (!copy.download) await renderClear(false); }
}
async function renderClear(scroll) {
  if($('#clear')) return;
  const section = el('section','chapter clear'); section.id='clear';
  section.append(el('h2','clear-title','Epilogue'),story(content.clear.body, scroll));
  if(content.clear.image) media(content.clear.image,section);
  const links = el('div','clear-links');
  for(const [key,label,placeholder] of [['postUrl','クリアをポストする','[クリアポストリンク]'],['surveyUrl','アンケートに答える','[アンケート]']]) {
    const url=content.clear[key];
    if(url && /^https:\/\//.test(url)) { const a=el('a','pending-link',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a); }
    else links.append(el('p','pending-link',placeholder));
  }
  section.append(links);
  if(content.clear.bonus) {
    const next=button('おまけに進む',async()=>{
      next.disabled=true;
      try { await renderStep(content.clear.bonus,true);progress.bonusStarted=true;save();next.hidden=true; }
      catch { next.disabled=false;error.textContent='読み込めませんでした。もう一度お試しください。'; }
    });
    const error=el('p','form-status');error.setAttribute('role','status');
    next.hidden=Boolean(progress.bonusStarted);section.append(next,error);
  }
  $('#journey').append(section);show(section,scroll);
  if(progress.bonusStarted && content.clear.bonus) await renderStep(content.clear.bonus,false);
}
$('#reset').addEventListener('click',()=>$('#reset-dialog').showModal());
$('#reset-dialog').addEventListener('close',()=>{ if($('#reset-dialog').returnValue==='reset') { try{localStorage.removeItem(storageKey);}catch{} location.reload(); } });
async function init() {
  $('#retry').hidden=true;$('#global-status').textContent='';
  try {
    [content,entry]=await Promise.all([json('./content.json'),json('./data/entry.json')]);
    storageKey=`projectmapping:${entry.version}`;
    try { const saved=JSON.parse(localStorage.getItem(storageKey));
      if(saved && typeof saved.started==='boolean' && typeof saved.begun==='boolean' && Array.isArray(saved.solved) && Array.isArray(saved.opened)) progress=saved;
    } catch {}
    if (!progress.answers || typeof progress.answers !== 'object' || Array.isArray(progress.answers)) progress.answers = {};
    document.title=content.title;
    $('#journey').replaceChildren(); rendered.clear();
    speechObserver.disconnect();
    for (const job of speechQueue) clearTimeout(job.timer);
    speechQueue.length = 0; activeSpeech = null;
    renderIntro(false, !progress.started);
    progress.started = true; save();
    $('#reset').hidden=false;
    if(progress.begun) await renderStep(entry.first,false);
  } catch { $('#global-status').textContent='ページを読み込めませんでした。接続を確認して再試行してください。';$('#retry').hidden=false; }
}
$('#retry').addEventListener('click',init);
init();
