// The AI page: the comparison model, its self-check against computed_defaults, and what the plates read from it.
// Numbers come from the plates' data; text by textContent only.
(function () {
const { plate } = window;
const { m: I, a: A, want, k_r_low, k_r_high, k_h_low, k_h_high, over_lo, over_hi } = JSON.parse(document.getElementById('plate-data-ai-same-hour').textContent).env;
const VIDEO_DC = A.video_dc_intensity.options;
const KIND = A.chat_kind.options;
const BASE = { prompts_per_hour: A.prompts_per_hour.default, device: 'phone', connection: 'wifi', network_mode: 'average', router_allocation: 'by_time', video_dc_intensity: 'measured_delivery', chat_wh_per_prompt: A.chat_wh_per_prompt.default };
// The kit's rounding for a computed figure: two significant figures, three at 99.5 and up. Three digits keep what the reader set and a division of two filings exact.
const figure = plate.fig;
const prompts = (N) => `${figure(N, 3)} ${N === 1 ? 'prompt' : 'prompts'}`;

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
    video_day: vmin * phone * perGb, video_day_desnz: vmin * phone * VIDEO_DC.desnz_followup, video_day_high: vmin * phone * I.video_dc_wh_per_gb.high,
    short_day: smin * shortGb * perGb, short_day_desnz: smin * shortGb * VIDEO_DC.desnz_followup, short_day_high: Math.min(smin * I.short_dc_ceiling_wh_per_hour.value, meta),
    short_ceiling_per_hour_at_minutes: meta / smin, chat_day_household_pct: chat / house * 100, meta_household_pct: meta / house * 100,
  };
}
function heavy(s) {
  const e = s.chat_wh_per_prompt;
  const W = I.stream_whole_chain_wh_per_hour;
  const hour = sameHour(s).video;
  const yardsticks = { same_device_total: hour.total, same_device_dc: hour.data_center, desnz_dc: I.video_gb_per_hour[s.device].value * VIDEO_DC.desnz_followup, published: W.value };
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
    youtube_dc_twh_delivery: hours * mix * VIDEO_DC.measured_delivery / 1e12, youtube_dc_twh_desnz: hours * mix * VIDEO_DC.desnz_followup / 1e12, youtube_dc_twh_top: hours * mix * VIDEO_DC.top_down / 1e12,
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
    desnz: ['video_dc_intensity', 'desnz_followup'], prompts_2_5: ['prompts_per_hour', p0], prompts_30: ['prompts_per_hour', p2], prompts_60: ['prompts_per_hour', p3],
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
const TOP_DOWN = 'The top-down average spreads all data center energy over all bytes. It is an upper bound of an unsettled allocation, not a literal share of this hour.';
const KIND_RANGE = { medium_prompt: { low: KIND.medium_prompt, high: KIND.medium_prompt }, reasoning: { low: k_r_low, high: k_r_high }, high_reasoning: { low: k_h_low, high: k_h_high } };

// Receipts for these settings, beyond the row's.
const KIND_CITES = { medium_prompt: ['fp-021', 'fp-020'], reasoning: ['fp-019'], high_reasoning: ['fp-025', 'fp-020'] };
function settingCites(st) {
  const out = [...(KIND_CITES[st.chat_kind] || [])];
  if (st.connection === 'cellular') out.push(...(st.network_mode === 'average' ? ['fp-128', 'fp-125', 'fp-053'] : ['fp-053', 'fp-129']));
  else out.push(st.network_mode === 'marginal' ? 'fp-129' : 'fp-124');
  if (st.video_dc_intensity === 'desnz_followup') out.push('fp-141', 'fp-142');
  if (st.video_dc_intensity === 'top_down') out.push('ec-024', 'fp-147', 'fp-150');
  if (st.device === 'laptop') out.push('fp-132');
  if (st.device === 'tv') out.push('fp-008', 'fp-143', 'fp-132');
  if (st.prompts === A.prompts_per_hour.presets[0]) out.push('fp-095', 'fp-151', 'fp-154');
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
    else Object.assign(dc, { hollow: true, word: { desnz_followup: 'a scenario input', top_down: 'a top-down average' }[st.video_dc_intensity] ?? (r.key === 'video' ? 'modeled from measured hours' : 'modeled') });
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
  for (const node of plot.querySelectorAll('.ladder-label')) node.firstChild.nodeValue = data.rows.find((x) => x.key === node.parentElement.dataset.row).label;
  for (const key of ACTIVITY) {
    const tag = plot.querySelector(`.ladder-row[data-row="${key}"] .ladder-tag`);
    tag.textContent = `Adds ${figure(inputs.now[key].activity_added)} Wh`;
    tag.hidden = state.boundary === 'adds'; // the value says it here
  }
  (plot.querySelector('.count-key') || countKey(plot, inputs.prompt)).hidden = state['ai-same-hour-plot'] !== 'count';
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
    const [row] = ctx.rows;
    if (row && ACTIVITY.includes(row.key)) {
      const seg = now[row.key];
      const thing = { chat: `a chat of ${prompts(st.prompts)}`, video: 'a streamed video hour', short: 'a short-video feed hour' }[row.key];
      const left = PARTS.slice(COUNTED[st.boundary]).map(([name, part]) => `${name} ${figure(seg[part])}`).join(', ');
      const own = `${figure(seg.router + seg.device)} Wh of that is your own ${seg.router ? 'screen and router' : 'screen'}.`;
      // The parts print in the list under it, and the kit adds a third sentence where ranges overlap.
      ctx.reading(`Counting ${COUNTING[st.boundary]} on ${DEVICE[st.device]}, ${thing} uses about ${figure(row.value)} Wh, or ${figure(row.low)} to ${figure(row.high)} Wh (modeled, 11/2026). ${left ? `Not counted at this boundary: ${left}.` : own}`);
      ctx.fact(`What this activity adds, the data center plus the network: ${figure(seg.activity_added)} Wh. The router and device add ${figure(seg.router + seg.device)} Wh to every row.`);
      if (row.key === 'chat') {
        ctx.fact(`${prompts(st.prompts)} at ${figure(s.chat_wh_per_prompt, 3)} Wh each.`);
        if (!short) ctx.fact('This kind of chat sets its own energy per prompt, so the Wh per short text prompt setting does not move this row.');
        if (st.chat_kind === 'medium_prompt' || st.chat_kind === 'high_reasoning') ctx.fact(`From a preprint that a peer-reviewed paper says overstates production figures ${over_lo} to ${over_hi} times.`);
        if (st.video_dc_intensity !== BASE.video_dc_intensity) ctx.fact(STREAM_ONLY);
      } else {
        if (st.prompts !== BASE.prompts_per_hour || !short || st.chat_wh_per_prompt !== BASE.chat_wh_per_prompt) ctx.fact(CHAT_ONLY);
        if (st.video_dc_intensity === 'top_down') ctx.fact(TOP_DOWN);
      }
    } else if (row) ctx.reading(row.reading.replace(' for the hour', '')); // a yardstick may be a charge or a day
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
    ctx.inputs.y_dc = y.same_device_dc;
    ctx.auto();
    if (st.heavy_intensity === 'top_down') ctx.fact(TOP_DOWN);
    const per = ctx.inputs.yard;
    if (ctx.reason !== 'select') {
      for (const r of ctx.data.rows) {
        const value = ctx.plot.querySelector(`.ladder-row[data-row="${r.key}"] .ladder-value`);
        if (!value.querySelector('.ladder-eq')) value.append(' ', el('span', 'ladder-tag ladder-eq'));
        value.querySelector('.ladder-eq').textContent = inTime((r.value ?? r.low) / per);
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
    const count = I.chat_messages_per_day[{ eight: 'high', panel: 'panel' }[ctx.state.day_count] ?? 'value'];
    const st = ctx.state;
    ctx.inputs.now = perDay({ ...BASE, chat_wh_per_prompt: st.day_wh, video_dc_intensity: st.day_intensity, chat_messages_per_day: count });
    ctx.auto();
    if (ctx.key === 'chat' && st.day_intensity !== BASE.video_dc_intensity) ctx.fact(STREAM_ONLY);
    if ((ctx.key === 'yt' || ctx.key === 'ig') && (st.day_count !== 'mean' || st.day_wh !== BASE.chat_wh_per_prompt)) ctx.fact(CHAT_ONLY);
    if ((ctx.key === 'yt' || ctx.key === 'ig') && st.day_intensity === 'top_down') ctx.fact(TOP_DOWN);
  },
});
plate.register('ai-scale', {
  render(ctx) {
    ctx.inputs.now = scale({ ...BASE, chat_wh_per_prompt: I.chat_wh_per_prompt[ctx.state.scale_wh] });
    ctx.auto();
    if (ctx.key === 'ytdc' && ctx.state.scale_intensity === 't') ctx.fact(TOP_DOWN);
  },
});

// Paying for it: one scale for all seven first, then the six measures. Each share divides two of the plate's own rows, so it carries their two claims; a year with no
// positive operating cash flow has no share. Without scripts the six panels and the table stand, and the two columns the share divides are side by side in it.
const shareRows = (rows) => {
  const flow = new Map(rows.filter((r) => r.panel === 'ocf').map((r) => [`${r.series}|${r.key}`, r.value]));
  return rows.filter((r) => r.panel === 'capex' && r.value >= 0 && flow.get(`${r.series}|${r.key}`) > 0).map((r) => ({ ...r, panel: 'share', value: (r.value / flow.get(`${r.series}|${r.key}`)) * 100 }));
};
function drawMoney({ plot, data: { plot: cfg, rows } }) {
  if (!plot.clientWidth) return;
  const { frame, inner, chart, add, scale } = plate.draw;
  const gap = 24;
  const cols = plot.clientWidth >= 520 ? 3 : plot.clientWidth >= 420 ? 2 : 1;
  const down = Math.ceil(cfg.panels.length / cols);
  const f = frame(plot, 236 + down * (150 + gap));
  const head = Math.min(340, Math.max(200, Math.round(f.H * 0.34)));
  const under = head + 20; // a line gives the six their unit
  const shares = shareRows(rows);
  const ticks = Array.from({ length: Math.ceil(Math.max(...shares.map((r) => r.value)) / 50) + 1 }, (_, i) => i * 50);
  const top = add(f.g, 'g', {});
  add(top, 'text', { class: 'm-title', x: 0, y: 22, 'aria-hidden': 'true', text: 'Capital spending as a share of operating cash flow (percent)' });
  const box = inner(top, f.W, head, { top: 36, right: 84, bottom: 24, left: 52 });
  const y = scale('linear', [0, ticks.at(-1)], [box.y0, box.y1]);
  add(top, 'line', { class: 'm-base', x1: box.x0, x2: box.x1, y1: y(100), y2: y(100) });
  add(top, 'text', { class: 'm-tick', x: box.x0 + 8, y: y(100) - 6, 'aria-hidden': 'true', text: 'Equal to cash flow' });
  chart(box, shares, { ...cfg, domain: [0, ticks.at(-1)], ticks, panels: true }, false);
  // At the right end, only the selected company and the highest and lowest line; the rest are Others in the legend and in the Table.
  const ends = new Map(shares.map((r) => [r.series, r.value])); // rows run oldest first, so each company keeps its last share
  const low = [...ends.keys()].sort((a, b) => ends.get(a) - ends.get(b));
  let at = box.y0 + 18; // from the bottom, so a name moved aside goes up, clear of the axis
  for (const name of low.filter((n, i) => n === cfg.highlight || !i || i === low.length - 1)) {
    at = Math.min(y(ends.get(name)), at - 18);
    add(top, 'text', { class: `m-label${name === cfg.highlight ? ' is-lead' : ' m-end'}`, x: box.x1 + 8, y: at, dy: '.32em', 'aria-hidden': 'true', text: name });
  }
  add(f.g, 'text', { class: 'm-tick', x: 0, y: head + 18, 'aria-hidden': 'true', text: 'The six below, in billion dollars by fiscal year' });
  const cw = (f.W + gap) / cols;
  const ch = (f.H - under) / down;
  // Each of the six names only the selected company, on its title's line, where no year's mark can cover the word. Where the longest title leaves no room, the first panel and the orange say it.
  const named = cw - gap >= (Math.max(...cfg.panels.map((p) => p.label.length)) + cfg.highlight.length) * 7 + 8;
  cfg.panels.forEach((panel, i) => {
    const g = add(f.g, 'g', { transform: `translate(${(i % cols) * cw} ${under + Math.floor(i / cols) * ch})` });
    const own = rows.filter((r) => r.panel === panel.id);
    add(g, 'text', { class: 'm-title', x: 0, y: 22, 'aria-hidden': 'true', text: panel.label });
    if (named && own.some((r) => r.series === cfg.highlight && r.value != null)) add(g, 'text', { class: 'm-label is-lead', x: cw - gap, y: 22, 'text-anchor': 'end', 'aria-hidden': 'true', text: cfg.highlight });
    chart(inner(g, cw - gap, ch - gap, { top: 36, right: 12, bottom: 24, left: 52 }), own, { ...cfg, ...panel, panels: true }, false);
  });
}
const moneyRoot = document.getElementById('ai-company-money');
// The table's own column for the first panel.
function shareColumn(rows) {
  const shares = new Map(shareRows(rows).map((r) => [`${r.series}|${r.key}`, figure(r.value, 3)]));
  const table = moneyRoot.querySelector('.plate-table');
  const before = (row, cell) => row.insertBefore(cell, row.lastElementChild);
  before(table.querySelector('thead tr'), Object.assign(el('th', '', 'Capital spending as a share of operating cash flow, percent'), { scope: 'col' }));
  for (const row of table.querySelectorAll('tbody tr')) before(row, el('td', '', shares.get(`${row.children[0].textContent}|${row.children[1].textContent}`) ?? ''));
}
plate.register('ai-company-money', {
  render(ctx) {
    if (ctx.reason === 'init') shareColumn(ctx.data.rows);
    if (ctx.reason !== 'select') drawMoney(ctx);
    for (const g of ctx.plot.querySelectorAll('.plate-svg > g')) { // the panels differ in width, so each needle stands at its own panel's year
      const nx = g.querySelector(`[data-row="${ctx.key}"]`)?.dataset.nx;
      if (nx) g.style.setProperty('--at', `${nx}px`);
    }
    const name = ctx.data.plot.highlight;
    const amount = (panel) => ctx.rows.find((r) => r.series === name && r.panel === panel)?.value;
    const [spent, flow] = [amount('capex'), amount('ocf')];
    if (!(spent >= 0 && flow > 0)) return;
    const share = figure((spent / flow) * 100, 3);
    const [first, ...rest] = ctx.data.readings[`${ctx.key}|${name}|`].split(/(?<=dollars\.) /);
    ctx.readout(share, 'percent');
    ctx.reading([first, `Capital spending was ${share} percent of operating cash flow.`, ...rest, ctx.data.tail].join(' '));
    ctx.fact(`${spent} / ${flow} = ${share} percent, capital spending as a share of operating cash flow in that fiscal year.`);
  },
});
moneyRoot.querySelector('.plate-plot').addEventListener('click', (e) => { // a name in any panel picks that company; the Company control is the keyboard's way
  const name = e.target.closest?.('.m-label')?.textContent;
  moneyRoot.querySelector(`input[name="company"][value="${name}"]:not(:checked)`)?.click();
});

// A pair's arithmetic, and a mark for a floor, which the kit's ruler leaves bare.
plate.register('ai-capex-cash', {
  render(ctx) {
    ctx.auto();
    const [a, b] = ctx.rows;
    if (a && b && b.value) ctx.fact(`${a.text} / ${b.text} = ${figure(a.value / b.value, 3)}, capital spending as a multiple of cash and securities at that year's end.`);
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
