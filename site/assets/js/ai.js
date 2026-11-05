// The AI page: the comparison model, its self-check against computed_defaults, and what the plates read from it.
// Numbers come from the plates' data; text by textContent only.
(function () {
const { plate } = window;
const { m: I, a: A, want, k_r_low, k_r_high, k_h_low, k_h_high, over_lo, over_hi } = JSON.parse(document.getElementById('plate-data-ai-same-hour').textContent).env;
const VIDEO_DC = A.video_dc_intensity.options;
const KIND = A.chat_kind.options;
const BASE = { prompts_per_hour: A.prompts_per_hour.default, device: 'phone', connection: 'wifi', network_mode: 'average', router_allocation: 'by_time', video_dc_intensity: 'measured_delivery', chat_wh_per_prompt: A.chat_wh_per_prompt.default };
const figure = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(+Number(v).toPrecision(3));
const prompts = (N) => `${figure(N)} ${N === 1 ? 'prompt' : 'prompts'}`;

// The equations of compare_model.py, the oracle. which picks value, low, or high of every input.
function sameHour(s, which = 'value') {
  const gb = { chat: s.prompts_per_hour * I.chat_kb_per_prompt[which] / 1e6, video: I.video_gb_per_hour[s.device][which], short: I.short_gb_per_hour[which] };
  const ePrompt = which === 'value' ? s.chat_wh_per_prompt : (s.prompt_range || I.chat_wh_per_prompt)[which];
  const perGb = which === 'value' ? VIDEO_DC[s.video_dc_intensity] : I.video_dc_wh_per_gb[which];
  const dc = { chat: s.prompts_per_hour * ePrompt, video: gb.video * perGb, short: Math.min(gb.short * perGb, I.short_dc_ceiling_wh_per_hour.value) };
  const net = I[`net_${s.connection === 'wifi' ? 'fixed' : 'mobile'}_${s.network_mode === 'average' ? 'avg' : 'marginal'}_wh_per_gb`][which];
  const out = {};
  for (const row of ['chat', 'video', 'short']) {
    let router = 0;
    if (s.connection !== 'cellular' && s.router_allocation !== 'excluded') router = s.router_allocation === 'by_time' ? I.router_watts[which] : I.router_wh_per_gb.value * gb[row];
    const seg = { data_center: dc[row], network: gb[row] * net, router, device: I.device_wh_per_hour[s.device][which] };
    seg.activity_added = seg.data_center + seg.network;
    seg.total = seg.activity_added + seg.router + seg.device;
    out[row] = seg;
  }
  return out;
}
function perDay(s) {
  const C = I.chat_messages_per_day;
  const P = I.chat_wh_per_prompt;
  const perGb = VIDEO_DC[s.video_dc_intensity];
  const vmin = I.video_minutes_per_day.value / 60;
  const smin = I.short_minutes_per_day.value / 60;
  const phone = I.video_gb_per_hour.phone.value;
  const shortGb = I.short_gb_per_hour.value;
  const meta = I.meta_wh_per_person_day.value;
  const house = I.household_wh_per_day.value;
  const chat = (s.chat_messages_per_day ?? C.value) * s.chat_wh_per_prompt;
  return {
    chat_day: chat, chat_day_low: C.low * P.low, chat_day_mean: C.value * P.mean, chat_day_high: C.high * P.high, meta_person: meta,
    video_day: vmin * phone * perGb, video_day_desnz: vmin * phone * VIDEO_DC.desnz_assumed, video_day_high: vmin * phone * I.video_dc_wh_per_gb.high,
    short_day: smin * shortGb * perGb, short_day_desnz: smin * shortGb * VIDEO_DC.desnz_assumed, short_day_high: Math.min(smin * I.short_dc_ceiling_wh_per_hour.value, meta),
    short_ceiling_per_hour_at_minutes: meta / smin, chat_day_household_pct: chat / house * 100, meta_household_pct: meta / house * 100,
  };
}
function heavy(s) {
  const e = s.chat_wh_per_prompt;
  const W = I.stream_whole_chain_wh_per_hour;
  const hour = sameHour(s).video;
  const yardsticks = { same_device_total: hour.total, same_device_dc: hour.data_center, desnz_dc: I.video_gb_per_hour[s.device].value * VIDEO_DC.desnz_assumed, published: W.value };
  const out = { yardsticks, text_prompt_seconds: Object.fromEntries(Object.entries(yardsticks).map(([k, v]) => [k, e / v * 3600])) };
  for (const [key, { wh: v }] of Object.entries(want.heavy_ai)) {
    if (v !== undefined) out[key] = { wh: v, prompts: v / e, hours_same_device: v / yardsticks.same_device_total, hours_published: v / W.value, hours_published_low: v / W.high, hours_published_high: v / W.low, hours_dc_delivery: v / yardsticks.same_device_dc, hours_dc_desnz: v / yardsticks.desnz_dc };
  }
  return out;
}
function scale(s) {
  const S = I.scale;
  const P = I.chat_wh_per_prompt;
  const msgs = S.chatgpt_messages_per_day.value;
  const year = (wh) => msgs * 365 * wh / 1e12;
  const hours = S.youtube_hours_per_day.value * 365;
  const W = I.stream_whole_chain_wh_per_hour;
  const nw = S.nw_dc_only_2030_amw;
  const mix = I.video_gb_per_hour.mix.value;
  const chat = year(s.chat_wh_per_prompt);
  return {
    chat_twh: chat, chat_twh_low: year(P.low), chat_twh_mean: year(P.mean), chat_twh_high: year(P.high), chat_amw: msgs * s.chat_wh_per_prompt / 24 / 1e6,
    chat_pct_iea_2025: chat / S.iea_world_2025_twh.value * 100, chat_pct_iea_2025_high: year(P.high) / S.iea_world_2025_twh.value * 100, chat_pct_lbnl_2024: chat / S.lbnl_us_2024_twh.value * 100,
    youtube_dc_twh_delivery: hours * mix * VIDEO_DC.measured_delivery / 1e12, youtube_dc_twh_desnz: hours * mix * VIDEO_DC.desnz_assumed / 1e12,
    youtube_whole_twh: hours * W.value / 1e12, youtube_whole_twh_low: hours * W.low / 1e12, youtube_whole_twh_high: hours * W.high / 1e12,
    nw_dc_twh_2030: nw.value * 8.76 / 1000, nw_dc_twh_2030_low: nw.low * 8.76 / 1000, nw_dc_twh_2030_high: nw.high * 8.76 / 1000, nw_dc_pct_of_region: nw.value / S.nw_region_amw.value * 100,
    iea_growth_2025_2030_twh: S.iea_world_2030_twh.value - S.iea_world_2025_twh.value, lbnl_growth_2024_2030_twh: S.lbnl_us_2030_twh.value - S.lbnl_us_2024_twh.value,
  };
}
function project(amw) {
  const twh = amw * 8.76 / 1000;
  const W = I.water_carbon;
  return { amw, twh, pct_of_region: amw / I.scale.nw_region_amw.value * 100, site_water_ml_low: twh * 1e9 * W.microsoft_wue_l_per_kwh.value / 1e6, site_water_ml_high: twh * 1e9 * W.google_fleet_wue_l_per_kwh.value / 1e6 };
}
// Recomputes computed_defaults and returns the paths that disagree.
function modelCheck() {
  const [p0, , p2, p3] = A.prompts_per_hour.presets;
  const alt = {
    laptop: ['device', 'laptop'], tv: ['device', 'tv'], router_by_data: ['router_allocation', 'by_data'], router_excluded: ['router_allocation', 'excluded'], cellular: ['connection', 'cellular'], marginal: ['network_mode', 'marginal'],
    desnz: ['video_dc_intensity', 'desnz_assumed'], prompts_2_5: ['prompts_per_hour', p0], prompts_30: ['prompts_per_hour', p2], prompts_60: ['prompts_per_hour', p3],
    kind_medium: ['chat_wh_per_prompt', KIND.medium_prompt], kind_reasoning: ['chat_wh_per_prompt', KIND.reasoning], kind_high: ['chat_wh_per_prompt', KIND.high_reasoning],
  };
  const hours = { default: sameHour(BASE), low: sameHour(BASE, 'low'), high: sameHour(BASE, 'high') };
  for (const [name, [k, v]] of Object.entries(alt)) hours[name] = sameHour({ ...BASE, [k]: v });
  const got = { same_hour: hours, per_person_day: perDay(BASE), heavy_ai: heavy(BASE), scale: scale(BASE), project: project(want.project.amw) };
  const bad = [];
  const walk = (stored, fresh, path) => {
    for (const [key, value] of Object.entries(stored)) {
      if (typeof value === 'object') walk(value, fresh?.[key], `${path}.${key}`);
      else if (!(Math.abs(value - fresh?.[key]) <= 1e-9 * Math.max(1, Math.abs(value)))) bad.push(`${path}.${key}`);
    }
  };
  for (const part of Object.keys(got)) walk(want[part], got[part], part);
  return bad;
}
const problems = modelCheck();
document.documentElement.dataset.modelCheck = problems.length ? 'failed' : 'passed';
if (problems.length) console.error('The comparison model disagrees with computed_defaults', problems);
window.aiModel = { BASE, sameHour, perDay, heavy, scale, project, modelCheck };

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text ?? '' });

// The same hour
const DEVICE = { phone: 'a phone', laptop: 'a laptop', tv: 'a television' };
const COUNTING = { dc: 'the data center alone', adds: 'the data center plus the network', whole: 'the whole hour' };
const PARTS = [['data center', 'data_center'], ['network', 'network'], ['router', 'router'], ['device', 'device']];
const COUNTED = { dc: 1, adds: 2, whole: 4 };
const ACTIVITY = ['chat', 'video', 'short'];
const STREAM_ONLY = 'The streaming setting moves the video rows, not this one.';
const CHAT_ONLY = 'The chat settings move the chat row, not this one.';
const KIND_RANGE = { medium_prompt: { low: KIND.medium_prompt, high: KIND.medium_prompt }, reasoning: { low: k_r_low, high: k_r_high }, high_reasoning: { low: k_h_low, high: k_h_high } };

// Receipts for these settings, beyond the row's.
const KIND_CITES = { medium_prompt: ['fp-021', 'fp-020'], reasoning: ['fp-019'], high_reasoning: ['fp-025', 'fp-020'] };
function settingCites(st) {
  const out = [...(KIND_CITES[st.chat_kind] || [])];
  if (st.connection === 'cellular') out.push(...(st.network_mode === 'average' ? ['fp-128', 'fp-125', 'fp-053'] : ['fp-053', 'fp-129']));
  else out.push(st.network_mode === 'marginal' ? 'fp-129' : 'fp-124');
  if (st.video_dc_intensity === 'desnz_assumed') out.push('fp-043');
  if (st.device === 'laptop') out.push('fp-132');
  if (st.device === 'tv') out.push('fp-008', 'fp-043', 'fp-132');
  if (st.prompts === A.prompts_per_hour.presets[0]) out.push('fp-095');
  return out;
}
function markEvidence(rows, st) {
  const short = st.chat_kind === 'short_text';
  for (const r of rows) {
    if (r.key === 'chat') {
      r.label = `Chat, ${prompts(st.prompts)}`;
      r.ownCites ??= r.cites;
      r.cites = [...(KIND_CITES[st.chat_kind] || []), ...r.ownCites]; // the kind's source comes first: its figure is the one shown
    }
    if (!ACTIVITY.includes(r.key)) continue;
    const [dc, , , device] = r.segments;
    if (r.key === 'chat') Object.assign(dc, short ? { hollow: undefined, word: 'measured at Google only' } : { hollow: true, word: 'modeled' });
    else Object.assign(dc, { hollow: true, word: st.video_dc_intensity === 'desnz_assumed' ? 'a scenario input' : r.key === 'video' ? 'modeled from measured hours' : 'modeled' });
    if (r.key === 'video' && st.device === 'phone') Object.assign(device, { hollow: undefined, word: 'measured during video' });
    else Object.assign(device, { hollow: true, word: st.device === 'phone' ? 'modeled from video measurements' : 'modeled' });
  }
}
function fillSegmentCells(root, now) {
  for (const key of ACTIVITY) {
    for (const stop of Object.keys(COUNTING)) {
      const line = root.querySelector(`[data-cell="${key}|${stop}|display"]`)?.parentElement;
      const s = now[key];
      if (line) [s.data_center, s.network, s.router, s.device].forEach((v, i) => { line.children[2 + i].textContent = figure(v); });
    }
  }
}
// Count: an activity's squares, split by what this boundary counts. The kit sizes and draws them.
function partsOf(r, unit, { now }, { boundary }) {
  if (!ACTIVITY.includes(r.key)) return null;
  const s = now[r.key];
  const [dc, , , device] = r.segments;
  const parts = [{ cls: 'seg-dc', hollow: dc.hollow, n: s.data_center / unit }];
  if (boundary !== 'dc') parts.push({ cls: 'seg-net', hollow: true, n: s.network / unit });
  if (boundary === 'whole') parts.push({ gap: true }, { cls: 'seg-band', hollow: true, n: s.router / unit }, { cls: 'seg-band', hollow: device.hollow, n: s.device / unit });
  return parts;
}
// Each boundary gets the ruler that holds its numbers, so none clips: whole decades around them, or at the whole hour an even ruler from
// zero, because its parts add. A household day stays off that ruler, in words.
function setRuler(ctx) {
  const { plot, state: { boundary }, data } = ctx;
  const whole = boundary === 'whole';
  const here = data.rows.filter((r) => r.when === boundary && r.key !== 'household');
  const nums = here.flatMap((r) => [r.value, r.low, r.high]).filter((v) => v > 0);
  const top = Math.max(...nums);
  const low = Math.floor(Math.log10(Math.min(...nums)));
  let ticks = Array.from({ length: Math.ceil(Math.log10(top)) - low + 1 }, (_, i) => 10 ** (low + i));
  if (whole) {
    const end = [150, 200, 300, 400, 600, 800, 1000, 1500, 2000].find((n) => n >= top);
    const steps = end % 3 ? 4 : 3;
    ticks = Array.from({ length: steps + 1 }, (_, i) => (i * end) / steps);
  }
  Object.assign(data.plot, { scale: whole ? 'linear' : 'log', domain: [ticks[0], ticks.at(-1)] });
  ctx.auto(); // formula rows and marks take their places on it
  const at = (v) => (v === null || v === undefined ? undefined : ctx.frac(v));
  for (const r of here) if (!r.f) ctx.setRow(r.key, { frac: at(r.value), lo: at(r.low), hi: at(r.high) });
  if (whole) ctx.setRow('household', { off: true, text: `${data.rows.find((r) => r.key === 'household').display}, off this ruler` });
  const placed = (node, t) => {
    node.style.setProperty('--x', ctx.frac(t));
    return node;
  };
  const grid = plot.querySelector('.ladder-grid');
  grid.querySelectorAll('i:not(.ladder-needle):not(.ladder-tick)').forEach((node) => node.remove());
  grid.prepend(...ticks.map((t) => placed(el('i', t ? '' : 'is-zero'), t)));
  plot.querySelector('.ladder-axis').replaceChildren(...ticks.map((t) => placed(el('span', '', plate.draw.fmt(t, ticks.at(-1))), t)));
  plot.closest('.plate').querySelector('.plate-claim > .caption + .caption').textContent = whole ? 'An even ruler from zero.' : 'Each mark is ten times the last.';
}
function countKey(plot, unit) {
  const key = plot.insertBefore(el('ul', 'count-key'), plot.firstChild);
  key.setAttribute('aria-hidden', 'true'); // the Table holds the same words
  const sample = (cls, text) => {
    const li = el('li', '');
    li.append(el('span', `count-sample ${cls}`), text);
    key.append(li);
  };
  key.append(el('li', 'count-key-unit', `One square is one ${figure(unit)} Wh text prompt.`));
  sample('seg-dc', 'Data center');
  sample('', 'Network');
  sample('seg-band', 'Router and device, on every row');
  sample('is-hollow', 'Hollow means modeled');
  return key;
}
function markRows(ctx) {
  const { plot, state, inputs, data } = ctx;
  const counting = state['ai-same-hour-plot'] === 'count';
  plot.closest('.plate').dataset.plotview = counting ? 'count' : 'ruler';
  for (const node of plot.querySelectorAll('.ladder-label')) node.firstChild.nodeValue = data.rows.find((x) => x.key === node.parentElement.dataset.row).label;
  // Whole hour: a thin bar under each mark, the shared router and device, then what the activity adds.
  const whole = state.boundary === 'whole';
  for (const key of ACTIVITY) {
    const row = plot.querySelector(`.ladder-row[data-row="${key}"]`);
    const tag = row.querySelector('.ladder-tag');
    tag.textContent = `Adds ${figure(inputs.now[key].activity_added)} Wh`;
    tag.hidden = state.boundary === 'adds'; // the value says it here
    row.classList.toggle('has-band', whole);
    if (whole) row.style.setProperty('--band', ctx.frac(inputs.now[key].router + inputs.now[key].device));
  }
  (plot.querySelector('.count-key') || countKey(plot, inputs.prompt)).hidden = !counting;
}
plate.register('ai-same-hour', {
  countParts: partsOf,
  render(ctx) {
    const st = ctx.state;
    const short = st.chat_kind === 'short_text';
    const s = { ...BASE, ...st, prompts_per_hour: st.prompts, chat_wh_per_prompt: short ? st.chat_wh_per_prompt : KIND[st.chat_kind], prompt_range: short ? null : KIND_RANGE[st.chat_kind] };
    const now = sameHour(s);
    Object.assign(ctx.inputs, { now, lo: sameHour(s, 'low'), hi: sameHour(s, 'high') });
    if (ctx.reason !== 'select') {
      markEvidence(ctx.data.rows, st);
      ctx.data.cites = settingCites(st);
    }
    ctx.auto();
    if (ctx.reason !== 'select') setRuler(ctx);
    const [row] = ctx.rows;
    if (row && ACTIVITY.includes(row.key)) {
      const seg = now[row.key];
      const thing = { chat: `a chat of ${prompts(st.prompts)}`, video: 'a streamed video hour', short: 'a short-video feed hour' }[row.key];
      const say = (parts) => parts.map(([name, part]) => `${name} ${figure(seg[part])}`).join(', ');
      const left = PARTS.slice(COUNTED[st.boundary]);
      ctx.reading(`Counting ${COUNTING[st.boundary]} on ${DEVICE[st.device]}, ${thing} uses about ${figure(row.value)} Wh for the hour (${figure(row.low)} to ${figure(row.high)} Wh). Counted: ${say(PARTS.slice(0, COUNTED[st.boundary]))}${left.length ? `; not counted at this boundary: ${say(left)}` : ''}. Modeled from the figures in its receipts, 11/2026.`);
      ctx.fact(`What this activity adds, the data center plus the network: ${figure(seg.activity_added)} Wh. The router and device add ${figure(seg.router + seg.device)} Wh to every row.`);
      if (row.key === 'chat') {
        ctx.fact(`${prompts(st.prompts)} at ${figure(s.chat_wh_per_prompt)} Wh each.`);
        if (!short) ctx.fact('This kind of chat sets its own energy per prompt, so the Wh per short text prompt setting does not move this row.');
        if (st.chat_kind === 'medium_prompt' || st.chat_kind === 'high_reasoning') ctx.fact(`From a preprint that a peer-reviewed paper says overstates production figures ${over_lo} to ${over_hi} times.`);
        if (st.video_dc_intensity !== BASE.video_dc_intensity) ctx.fact(STREAM_ONLY);
      } else if (st.prompts !== BASE.prompts_per_hour || !short || st.chat_wh_per_prompt !== BASE.chat_wh_per_prompt) ctx.fact(CHAT_ONLY);
    }
    if (ctx.reason !== 'select') {
      fillSegmentCells(ctx.plot.closest('.plate'), now);
      markRows(ctx);
    }
  },
});
const controls = document.querySelector('#ai-same-hour .plate-controls');
controls.prepend(controls.querySelector('[data-param="ai-same-hour-plot"]'));

// Heavy AI
function inTime(hours) {
  if (hours < 1 / 30) return `${figure(hours * 3600)} seconds`;
  return hours < 1 ? `${figure(hours * 60)} minutes` : `${figure(hours)} hours`;
}
plate.register('ai-heavy-ai', {
  render(ctx) {
    const st = ctx.state;
    const { yardsticks: y } = heavy({ ...BASE, device: st.heavy_device, video_dc_intensity: st.heavy_intensity });
    ctx.inputs.y_same = y.same_device_total;
    ctx.inputs.y_dc = st.heavy_intensity === 'desnz_assumed' ? y.desnz_dc : y.same_device_dc;
    ctx.auto();
    const per = ctx.inputs.yard;
    if (ctx.reason !== 'select') {
      for (const r of ctx.data.rows) {
        const node = ctx.plot.querySelector(`.ladder-row[data-row="${r.key}"]`);
        const cell = node.querySelector('.ladder-eq') || node.appendChild(el('span', 'ladder-eq'));
        cell.textContent = inTime((r.value ?? r.low) / per);
      }
    }
    const [r] = ctx.rows;
    if (!r) return;
    const device = DEVICE[st.heavy_device].slice(2);
    const yard = { same: `the ${device} video hour`, pub: 'the published European hour', dc: `the ${device} hour's data center segment` }[st.yard];
    const evidence = r.reading.split(/(?<=\.) /).slice(1).join(' ');
    ctx.reading(`${r.label}: about ${r.display}, or ${r.fields.prompts} text ${r.fields.prompts === '1' ? 'prompt' : 'prompts'} and ${inTime((r.value ?? r.low) / per)} of ${yard}. ${evidence}`);
  },
});

plate.register('ai-per-day', {
  render(ctx) {
    const count = I.chat_messages_per_day[ctx.state.day_count === 'eight' ? 'high' : 'value'];
    const st = ctx.state;
    ctx.inputs.now = perDay({ ...BASE, chat_wh_per_prompt: st.day_wh, video_dc_intensity: st.day_intensity, chat_messages_per_day: count });
    ctx.auto();
    if (ctx.key === 'chat' && st.day_intensity !== BASE.video_dc_intensity) ctx.fact(STREAM_ONLY);
    if ((ctx.key === 'yt' || ctx.key === 'ig') && (st.day_count !== 'mean' || st.day_wh !== BASE.chat_wh_per_prompt)) ctx.fact(CHAT_ONLY);
  },
});
plate.register('ai-scale', {
  render(ctx) {
    ctx.inputs.now = scale({ ...BASE, chat_wh_per_prompt: I.chat_wh_per_prompt[ctx.state.scale_wh] });
    ctx.auto();
  },
});

// A pair's arithmetic, and a mark for a floor, which the kit's ruler leaves bare.
plate.register('ai-capex-cash', {
  render(ctx) {
    ctx.auto();
    const [a, b] = ctx.rows;
    if (a && b && b.value) ctx.fact(`${a.text} / ${b.text} = ${figure(a.value / b.value)}, capital spending as a multiple of cash and securities at that year's end.`);
  },
});
plate.register('ai-guidance-2026', {
  render(ctx) {
    ctx.auto();
    const tesla = ctx.data.rows.find((r) => r.key === 'tesla');
    if (ctx.reason !== 'select') ctx.setRow('tesla', { frac: ctx.frac(tesla.low), text: tesla.display });
  },
});
}());
