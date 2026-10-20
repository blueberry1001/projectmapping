import { normalizeAnswer, checkAnswers, NORMALIZATION } from './shared/answers.mjs';
const $ = selector => document.querySelector(selector);
const colors = ['#007c54', '#0072ad', '#c3af37', '#394c5c', '#bb2c18'];
const icons = {
  neutral: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
  correct: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  incorrect: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
};
let content, entry, storageKey, progress = { started:false, begun:false, solved:[], opened:[] };
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
  node.classList.add('reveal');
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

// Reserve the full text layout, then reveal one block at a time in document order.
const textQueue = [];
let activeText = null;
function advanceText() {
  if (activeText) return;
  const job = textQueue.find(item => !item.done);
  if (!job || !job.ready) return;
  activeText = job;
  job.node.classList.add('is-reading');
  const finish = () => {
    if (job.done) return;
    clearTimeout(job.timer);
    job.node.classList.add('is-complete');
    job.done = true;
    activeText = null;
    advanceText();
  };
  job.finish = finish;
  job.node.lastElementChild.addEventListener('animationend', finish, {once:true});
  // Also complete if animation events are suppressed (background tab or motion setting).
  job.timer = setTimeout(finish, job.duration + 80);
}
const textObserver = new IntersectionObserver(entries => {
  for (const item of entries) {
    if (!item.isIntersecting) continue;
    const index = textQueue.findIndex(job => job.node === item.target);
    // Scrolling ahead also schedules preceding blocks, so the queue cannot stall offscreen.
    for (let i = 0; i <= index; i++) textQueue[i].ready = true;
    textObserver.unobserve(item.target);
  }
  advanceText();
}, { threshold: 0 });
reducedMotion.addEventListener('change', () => {
  if (!reducedMotion.matches) return;
  for (const job of textQueue) {
    clearTimeout(job.timer);
    job.done = true;
    job.node.classList.add('is-complete');
  }
  activeText = null;
  textObserver.disconnect();
});
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
function revealText(node, text, animate, colors = []) {
  const animated = animate && !reducedMotion.matches && !/^\[.*\]$/.test(text);
  const accessible = el('span', 'sr-only', text);
  const visual = el('span', 'typed-text');
  visual.setAttribute('aria-hidden', 'true');
  const chars = [...segmenter.segment(text)];
  const interval = Math.min(12, 3000 / Math.max(1, chars.length));
  chars.forEach(({segment:char,index}, i) => {
    const span = el('span', animated ? 'typed-char' : '', char);
    const color = colors.find(range => index >= range.start && index < range.end);
    if (color) span.style.color = color.color;
    if (animated) span.style.setProperty('--letter-delay', `${i * interval}ms`);
    visual.append(span);
  });
  node.append(accessible, visual);
  if (animated && chars.length) {
    textQueue.push({node:visual, duration:(chars.length - 1) * interval + 1, ready:false, done:false});
    textObserver.observe(visual);
  }
}
function story(blocks, animate = true) {
  const body = el('div', 'chapter-body story');
  for (const block of typeof blocks === 'string' ? [{type:'paragraph', text:blocks}] : blocks) {
    if (block.type === 'image') { media({src:null,alt:block.text},body); continue; }
    if (block.type === 'heading') {
      const heading = el('h3','story-heading');
      revealText(heading,block.text,animate,block.colors);
      body.append(heading); continue;
    }
    if (block.type === 'list') {
      const list = el('ul','story-list');
      for (const value of block.items) {
        const item=el('li'), data=typeof value==='string'?{text:value}:value;
        revealText(item,data.text,animate,data.colors); list.append(item);
      }
      body.append(list); continue;
    }
    // Keep source wording and line breaks; separate speech from narration even in mixed paragraphs.
    const passages = [];
    let offset = 0;
    for (const line of block.text.split('\n')) {
      const dialogue = line.startsWith('「');
      const previous = passages.at(-1);
      if (previous && previous.dialogue === dialogue) previous.text += '\n' + line;
      else passages.push({text:line, dialogue, offset});
      offset += line.length + 1;
    }
    for (const passage of passages) {
      const className = passage.dialogue ? 'story-dialogue' : passage.text.startsWith('※') ? 'story-notice' : '';
      const paragraph = el('p',className);
      const colors = (block.colors || []).filter(range =>
        range.end > passage.offset && range.start < passage.offset + passage.text.length
      ).map(range => ({...range, start:Math.max(0,range.start-passage.offset),
        end:Math.min(passage.text.length,range.end-passage.offset)}));
      let text = passage.text;
      if (passage.dialogue) {
        const removed = new Set([...text.matchAll(/^「|」$/gm)].map(match => match.index));
        const offsets = [0];
        for (let i = 0; i < text.length; i++) offsets.push(offsets[i] + (removed.has(i) ? 0 : 1));
        text = text.replace(/^「|」$/gm, '');
        for (const range of colors) { range.start = offsets[range.start]; range.end = offsets[range.end]; }
      }
      revealText(paragraph,text,animate,colors);
      body.append(paragraph);
    }
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
  form.setAttribute('aria-label', `Area${data.number}の回答`);
  const fields = el('div','fields');
  for(let i=0;i<data.groups.length;i++) fields.append(row(i));
  form.append(fields);
  if(data.treasure) { form.append(el('p','treasure-label','宝のありか')); form.append(row(data.groups.length,true)); }
  const rows = [...form.querySelectorAll('.answer-row')], inputs = rows.map(r=>r.querySelector('input'));
  inputs.at(-1).enterKeyHint = 'done';
  const status = el('p','form-status'); status.id = `${data.id}-status`; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  inputs.forEach(input=>input.setAttribute('aria-describedby',status.id));
  const submit = el('button','primary','回答する'); submit.type = 'submit'; submit.append(el('span','arrow'));
  form.append(status,submit);
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
        status.textContent = ''; progress.solved.push(data.id); save();
        submit.hidden = true; inputs.forEach(i=>i.readOnly=true); complete(true);
        return;
      }
      status.textContent = '';
    } catch { status.textContent = '判定できませんでした。もう一度お試しください。'; }
    finally { if(!progress.solved.includes(data.id)) { busy=false; inputs.forEach(i=>i.readOnly=false); submit.firstChild.textContent='回答する'; refresh(); } }
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
  if(data.number===3) section.style.setProperty('--step-ink','#373431');
  section.append(el('h2','chapter-heading',`Area${data.number}`),story(copy.body, scroll));
  if (copy.headingColor) section.querySelector('h2').style.color=copy.headingColor;
  const complete = (animate = false) => {
    if(section.querySelector('.completion')) return;
    const completion = el('div','completion'); completion.append(el('p','complete-note','正解'));
    if(copy.area) media(copy.area,completion);
    const status = el('p','form-status'); status.setAttribute('role','status');
    const next = button('次へ',async()=>{
      next.disabled = true; status.textContent='';
      try { if(data.next) await renderStep(data.next,true); else renderClear(true);
        progress.opened.push(data.id); save(); next.hidden=true;
      } catch { status.textContent='読み込めませんでした。もう一度お試しください。';next.disabled=false; }
    },'primary continue');
    next.hidden=progress.opened.includes(data.id);
    completion.append(next,status); section.append(completion);
    if(animate) { completion.classList.add('reveal'); completion.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'nearest'}); }
  };
  if(progress.solved.includes(id)) complete(); else renderForm(data,section,complete);
  $('#journey').append(section); rendered.add(id); show(section,scroll);
  if(progress.solved.includes(id) && progress.opened.includes(id)) { if(data.next) await renderStep(data.next,false); else renderClear(false); }
}
function renderClear(scroll) {
  if($('#clear')) return;
  const section = el('section','chapter clear'); section.id='clear';
  section.append(el('h2','clear-title','Epilogue'),story(content.clear.body, scroll));
  media(content.clear.image,section);
  const links = el('div','clear-links');
  for(const [key,label,placeholder] of [['postUrl','クリアをポストする','[クリアポストリンク]'],['surveyUrl','アンケートに答える','[アンケート]']]) {
    const url=content.clear[key];
    if(url && /^https:\/\//.test(url)) { const a=el('a','pending-link',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a); }
    else links.append(el('p','pending-link',placeholder));
  }
  section.append(links);$('#journey').append(section);show(section,scroll);
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
    document.title=content.title;
    $('#journey').replaceChildren(); rendered.clear();
    textObserver.disconnect();
    for (const job of textQueue) clearTimeout(job.timer);
    textQueue.length = 0; activeText = null;
    renderIntro(false, !progress.started);
    progress.started = true; save();
    $('#reset').hidden=false;
    if(progress.begun) await renderStep(entry.first,false);
  } catch { $('#global-status').textContent='ページを読み込めませんでした。接続を確認して再試行してください。';$('#retry').hidden=false; }
}
$('#retry').addEventListener('click',init);
init();
