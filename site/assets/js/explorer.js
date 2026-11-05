// Resource Use Explorer: the model's formulas, ported from scripts/resource_model.py, which stays canonical (work/site-refresh/tmp/explorer_dom_check.js
// holds this file to Python's numbers), and the page around them. Every coefficient comes from the page's inline data. Text by textContent only.
(function () {
'use strict';
const HOURS = 8760;
const WEEK = 168; // hours in the week Your Use counts
const blank = (v) => v === undefined || v === null;

// ---------------------------------------------------------------- the equations
const idleMult = (u, a) => (a / u + 1 - a) / (1 + a);
const wGenNw = (share, convention, gas) => share * convention + (1 - share) * gas;
const tokensUsd = (tIn, tOut, tCache, pIn, pOut, pCache = 0) => (tIn * pIn + tCache * pCache + tOut * pOut) / 1e6;
const tokensWh = (tIn, tOut, tCache, p) => (tIn * p.ei_in + tCache * p.ei_in * p.cache_share + tOut * p.ei_out) / 1000 * p.pue_hyper;
const selfRun = (hardware, kwh, tariff, hours, wage, support = 0) => hardware + kwh * tariff + hours * wage + support;
const positive = (a, b) => (b > 0 ? a / b : null); // a crossover exists only when the per-unit gap favors the local option
const genWater = (p, kind) => (kind === 'mix' ? wGenNw(p.hydro_share, p.hydro_conv, p.gas_water) : kind === 'fixed' ? p.w_gen_dc : kind === 'hydro' ? p.hydro_conv : null);
const netIntensity = (p) => (p.connection === 'wifi' ? (p.network_mode === 'average' ? p.net_fixed_avg : p.net_fixed_marg) : (p.network_mode === 'average' ? p.net_mobile_avg : p.net_mobile_marg));
const routerWh = (p, gb) => (p.connection !== 'wifi' || p.router_allocation === 'excluded' ? 0 : p.router_allocation === 'by_time' ? p.router_w : p.router_wh_per_gb * gb);
const chatWh = (p) => (p.chat_kind === 'short_text' ? p.e_prompt : p.chat_kind_wh);

// A layer: Wh, its grid and water, its place (a basin), its segment on the Wall, and which grid setting it reads.
const layer = (wh, grid, site, gen, place, tag, feed) => ({ wh, grid, site, gen, place, tag, feed });
function four(layers, usd = null) {
  const out = { wh: 0, usd, g: 0, ml: 0, by: {}, places: [], feeds: [] };
  const byPlace = {};
  for (const l of layers) {
    const ml = l.gen === null ? null : l.wh * (l.site + l.gen);
    out.wh += l.wh;
    out.g += l.wh * l.grid / 1000;
    out.ml = ml === null || out.ml === null ? null : out.ml + ml;
    const part = out.by[l.tag] || (out.by[l.tag] = { wh: 0, g: 0, ml: 0 });
    part.wh += l.wh;
    part.g += l.wh * l.grid / 1000;
    part.ml = ml === null || part.ml === null ? null : part.ml + ml;
    byPlace[l.place] = ml === null || byPlace[l.place] === null ? null : (byPlace[l.place] || 0) + ml;
    if (!out.feeds.includes(l.feed)) out.feeds.push(l.feed);
  }
  out.places = Object.keys(byPlace).sort();
  if (out.ml !== null && out.places.length > 1) out.ml_by_place = byPlace;
  return out;
}

function sameHour(p) {
  const iNet = netIntensity(p);
  const gb = { chat: p.prompts_per_hour * p.kb_prompt / 1e6, video: p[`gb_${p.device}`], short: p.short_gb };
  const dc = { chat: p.prompts_per_hour * chatWh(p), video: gb.video * p.i_dc, short: Math.min(p.short_gb * p.i_dc, p.short_ceiling) };
  const device = p[`dev_${p.device}`];
  const out = {};
  for (const row of ['chat', 'video', 'short']) {
    const network = gb[row] * iNet;
    const router = routerWh(p, gb[row]);
    const added = dc[row] + network;
    out[row] = { data_center: dc[row], network, router, device, activity_added: added, total: added + router + device };
  }
  return out;
}

function catalog(p, sh, L) {
  const iNet = netIntensity(p);
  const device = p[`dev_${p.device}`];
  const promptUsd = tokensUsd(p.tok_in_short, p.tok_out_short, 0, p.p_in, p.p_out);
  const turnWh = tokensWh(p.coding_fresh, p.coding_out, p.coding_cached, p);
  const turnUsd = tokensUsd(p.coding_fresh, p.coding_out, p.coding_cached, p.p_in, p.p_out, p.p_cache);
  const meanWh = tokensWh(p.coding_fresh_mean, p.coding_out_mean, p.coding_cached_mean, p);
  const meanUsd = tokensUsd(p.coding_fresh_mean, p.coding_out_mean, p.coding_cached_mean, p.p_in, p.p_out, p.p_cache);
  const codeRouter = routerWh(p, p.coding_gb_per_hour);
  const seatWh = p.seat_kwh_yr * 1000 / 12;
  const storageWh = p.seat_gb / 1000 * p.stor_wh_tb_h * HOURS / 12 * p.replicas * p.pue_hyper;
  const hourRow = (row, usd) => {
    const s = sh[row];
    const out = four([L.dc(s.data_center), L.net(s.network), L.router(s.router), L.device(s.device)], usd);
    out.layers = { data_center: s.data_center, network: s.network, router: s.router, device: s.device };
    if (p.device === 'phone') out.device_at_wall_wh = s.device * (1 + p.charger_overhead);
    return out;
  };
  const rows = {
    chat_prompt: four([L.dc(chatWh(p))], promptUsd),
    chat_hour: hourRow('chat', p.prompts_per_hour * promptUsd),
    coding_session: four([L.dc(p.coding_turns * turnWh)], p.coding_turns * turnUsd),
    coding_hour: four([L.dc(p.turns_per_hour * meanWh), L.net(p.coding_gb_per_hour * iNet), L.router(codeRouter), L.device(device)], p.turns_per_hour * meanUsd),
    image: four([L.dc(p.image_wh)], p.p_image),
    clip: four([L.dc(p.clip_wh)], p.clip_seconds * p.p_clip_s),
    search_ai: four([L.dc(p.search_base_wh + p.e_prompt)], p.p_search + promptUsd),
    short_hour: hourRow('short', p.rev_meta),
    video_hour: hourRow('video', p.rev_netflix),
    seat_month: four([L.dc(seatWh)], p.seat_usd),
    video_delivery: four([L.dc(p.gb_phone * p.i_dc), L.net(p.gb_phone * iNet)], p.p_delivery),
  };
  Object.assign(rows.coding_hour, {
    layers: { data_center: p.turns_per_hour * meanWh, network: p.coding_gb_per_hour * iNet, router: codeRouter, device },
    top_down_usd: p.coding_usd_per_active_day / p.coding_hours_per_active_day,
    median_turn_wh: turnWh,
  });
  Object.assign(rows.coding_session, { mean_session_wh: p.coding_turns_mean * meanWh, mean_session_usd: p.coding_turns_mean * meanUsd });
  Object.assign(rows.seat_month, { laptop_beside_wh: p.seat_hours_month * p.dev_laptop, storage_beside_wh: storageWh });
  Object.assign(rows.chat_hour, { at_mean_prompt_wh: rows.chat_hour.wh + p.prompts_per_hour * (p.e_prompt_mean - chatWh(p)), paid_plan_usd: p.paid_chat_month / p.chat_hours_month });
  Object.assign(rows.video_hour, { youtube_ads_usd: p.rev_youtube, paid_plan_usd: p.paid_video_month / p.video_hours_month });
  rows.search_ai.search_revenue_usd = p.rev_search;
  rows.chat_prompt.per_m_output = { wh: chatWh(p) / p.tok_out_short * 1e6, usd: promptUsd / p.tok_out_short * 1e6 };
  rows.coding_session.per_m_output = { wh: turnWh / p.coding_out * 1e6, usd: turnUsd / p.coding_out * 1e6 };
  return [rows, { prompt_usd: promptUsd, seat_wh: seatWh, i_net: iNet }];
}

function hourBaseline(p, cat, c, L) {
  const device = p[`dev_${p.device}`];
  const row = (added, usd, gb = 0) => {
    const router = routerWh(p, gb);
    return Object.assign(four([L.dc(added), L.net(gb * c.i_net), L.router(router), L.device(device)], usd), { added: added + gb * c.i_net, router, device });
  };
  const searchGb = p.searches_per_hour * p.kb_prompt / 1e6;
  return {
    image: row(p.images_per_hour * cat.image.wh, p.images_per_hour * cat.image.usd),
    clip: row(p.clips_per_hour * cat.clip.wh, p.clips_per_hour * cat.clip.usd),
    search: row(p.searches_per_hour * cat.search_ai.wh, p.searches_per_hour * cat.search_ai.usd, searchGb),
    office: row(cat.seat_month.wh / p.seat_hours_month, p.seat_usd / p.seat_hours_month),
  };
}

function whereItRuns(p, cat) {
  const a = p.a_idle;
  const ref = idleMult(p.u_hyper, a);
  const coloX = p.pue_colo / p.pue_hyper * idleMult(p.u_colo, a) / ref;
  const roomX = p.pue_room / p.pue_hyper * idleMult(p.u_room, a) / ref;
  const deviceX = (1 - a) / (1 + a) * p.local_penalty / p.pue_hyper;
  const work = {
    prompt: [cat.chat_prompt, tokensUsd(p.tok_in_short, p.tok_out_short, 0, p.p_open_in, p.p_open_out)],
    coding_session: [cat.coding_session, p.coding_turns * tokensUsd(p.coding_fresh, p.coding_out, p.coding_cached, p.p_open_in, p.p_open_out, p.p_open_cache)],
    image: [cat.image, null],
    clip: [cat.clip, null],
  };
  const out = {};
  for (const [name, [row, coloUsd]] of Object.entries(work)) {
    const e = row.wh;
    out[name] = {
      hyper: four([layer(e, p.grid_dc, p.wue_site, p.w_gen_dc, 'cloud', 'dc', 'fixed')], row.usd), // as Python: this row's water reads w_gen_dc whatever the grid setting
      colo: four([layer(e * coloX, p.grid_colo, p.wue_site, genWater(p, p.gen_colo), 'cloud', 'dc', 'colo')], coloUsd),
      node: four([layer(e * roomX, p.grid_local, p.wue_local, genWater(p, p.gen_local), 'cloud', 'dc', 'local')], null),
      device: four([layer(e * deviceX, p.grid_home, p.wue_local, genWater(p, p.gen_home), 'cloud', 'dev', 'home')], e * deviceX / 1000 * p.tariff_home),
    };
  }
  return out;
}

function office(p, c, L) {
  const users = p.office_users;
  const cloudWh = c.seat_wh * 12 * users;
  const syncWh = p.sync_w * p.active_hours * users;
  const serverWh = p.office_w * HOURS * p.pue_room;
  const hardware = (p.office_box_usd + p.office_tb * p.hdd_usd_tb) / p.life;
  const hours = p.office_admin_h_month * 12;
  const support = p.support_usd_user_yr * users;
  const price = (wage, boxes = 1) => selfRun(boxes * hardware, boxes * serverWh / 1000, p.tariff, hours, wage, support);
  const cloudAdmin = p.cloud_admin_h_month * 12 * p.wage;
  const cloudUsd = p.seat_usd * 12 * users + cloudAdmin;
  const usdAtWage = {};
  for (const w of p.wage_readings) usdAtWage[String(Math.trunc(w))] = price(w);
  return {
    cloud: four([L.dc(cloudWh)], cloudUsd),
    cloud_with_sync: four([L.dc(cloudWh), L.home(syncWh)], cloudUsd),
    cloud_same_grid: four([layer(cloudWh, p.grid_local, p.wue_site, genWater(p, p.gen_local), 'local', 'dc', 'local')], cloudUsd),
    local: four([L.room(serverWh)], price(p.wage)),
    local_hydro: four([L.hydro(serverWh)], price(p.wage)),
    local_two_boxes: four([L.room(2 * serverWh)], price(p.wage, 2)),
    readings: {
      sync_wh: syncWh,
      cloud_admin_usd: cloudAdmin,
      vendor_all_scopes_g: p.m365_g_month * 12 * users,
      vendor_scope3_g: p.m365_g_month * 12 * users * p.m365_scope3_share,
      ratio_energy_local_over_cloud: serverWh / cloudWh,
      ratio_energy_two_boxes_over_cloud: 2 * serverWh / cloudWh,
      ratio_energy_local_over_cloud_with_sync: serverWh / (cloudWh + syncWh),
      embodied_local_g: (p.emb_desktop_kg + p.office_tb * p.emb_hdd_kg_tb) / p.life * 1000,
      embodied_local_g_low_hdd: (p.emb_desktop_kg + p.office_tb * p.emb_hdd_low_kg_tb) / p.life * 1000,
      water_no_hydro_ml: serverWh * wGenNw(p.hydro_share, 0, p.gas_water),
      usd_at_wage: usdAtWage,
      wage_at_price_tie: positive(p.seat_usd * 12 * users - hardware - serverWh / 1000 * p.tariff - support, hours - p.cloud_admin_h_month * 12),
      sync_w_at_energy_tie: (serverWh - cloudWh) / (p.active_hours * users),
    },
  };
}

function video(p, c, L) {
  const block = p.views_block;
  const gb = p.gb_phone;
  const idleOn = 1 - p.already_on;
  const out = { platform: four([L.dc(block * gb * p.i_dc), L.net(block * gb * c.i_net)], block * p.p_delivery) };
  const perView = {};
  const idleView = {};
  const box = p.mini_box_usd / p.life;
  const hours = p.mini_admin_h_month * 12;
  for (const v of p.views) {
    const idle = idleOn * p.mini_w * HOURS / v * p.pue_room;
    const wh = p.stream_w * p.pue_room + idle;
    const annual = selfRun(box, wh * v / 1000, p.tariff, hours, p.wage);
    out[`local_${v}`] = Object.assign(four([L.room(block * wh), L.net(block * gb * c.i_net)], annual / v * block), {
      node_only_wh: block * wh, with_marginal_network_wh: block * wh + block * gb * p.net_fixed_marg,
    });
    perView[v] = wh;
    idleView[v] = idle;
  }
  const first = perView[p.views[0]] * p.views[0] / 1000;
  const cacheWhGb = p.oca_w / (p.oca_gbps / 8 * p.oca_load) / 3600;
  out.cache = four([L.room(block * gb * cacheWhGb + gb * c.i_net)], null);
  out.readings = {
    platform_ad_revenue_usd: block * p.rev_youtube,
    viewer_side_wh_per_view: routerWh(p, gb) + p[`dev_${p.device}`],
    local_wh_per_view: perView,
    local_idle_wh_per_view: idleView,
    local_usd_per_year: selfRun(box, first, p.tariff, hours, p.wage),
    local_usd_per_year_no_staff: selfRun(box, first, p.tariff, hours, 0),
    embodied_local_g_per_year: p.emb_mini_kg / p.life * 1000,
    cache_wh_per_gb: cacheWhGb,
  };
  return out;
}

function data(p, c, L) {
  const n = p.nations;
  const tb = p.shared_tb;
  const total = tb * 1000;
  const on = p.already_on;
  const nasWh = p.nas_w * HOURS * p.pue_room;
  const pullWh = n * total * c.i_net;
  const queryWh = p.fed_moved_share * total * 12 * c.i_net;
  const admin = p.nas_admin_h_month * 12;
  const centralWh = tb * p.replicas * p.stor_wh_tb_h * HOURS * p.pue_hyper;
  const centralAdmin = p.central_admin_h_month * 12 * p.wage;
  const s3 = total * p.p_s3 * 12 + centralAdmin;
  const egress = n * total * p.p_egress;
  const fedHours = n * p.fed_admin_h_month * 12;
  const drivesWh = (held) => held * p.stor_wh_tb_h * HOURS * p.pue_room;
  const local = (each, hours, netWh) => {
    const wh = n * (on ? drivesWh(each) : nasWh);
    const hardware = n * (each * p.hdd_usd_tb + (on ? 0 : p.nas_chassis_usd)) / p.life;
    return four([L.room(wh), L.net(netWh)], selfRun(hardware, (wh + netWh) / 1000, p.tariff, hours, p.wage));
  };
  const fedTb = p.fed_tb * p.fed_copies;
  return {
    ten_copies: local(p.nas_raw_tb, n * admin, pullWh),
    central_s3: four([L.dc(centralWh)], s3),
    central_s3_with_pulls: four([L.dc(centralWh), L.net(pullWh)], s3 + egress),
    central_r2: four([L.dc(centralWh)], total * p.p_r2 * 12 + centralAdmin),
    central_b2: four([L.dc(centralWh)], tb * p.p_b2_tb * 12 + centralAdmin),
    federated: local(fedTb, fedHours, queryWh),
    federated_replicas: local(p.fed_tb * p.replicas, fedHours, queryWh),
    readings: {
      network_one_pull_each_wh: pullWh,
      query_wh_per_year: queryWh,
      federated_wh_nodes_on: n * drivesWh(fedTb) + queryWh,
      federated_wh_nodes_not_on: n * nasWh + queryWh,
      egress_one_pull_each_usd: egress,
      central_admin_usd: centralAdmin,
      labor_ten_copies_usd: n * admin * p.wage,
      embodied_ten_copies_g: n * p.nas_raw_tb * p.emb_hdd_kg_tb / p.life * 1000,
      embodied_ten_copies_g_low_hdd: n * p.nas_raw_tb * p.emb_hdd_low_kg_tb / p.life * 1000,
      embodied_federated_g: n * fedTb * p.emb_hdd_kg_tb / p.life * 1000,
      duplicate_bytes_removed_gb: n * total * p.dedupe,
    },
  };
}

function prompts(p, L) {
  const block = p.prompts_block;
  const tIn = p.tok_in_median;
  const tOut = p.tok_out_median;
  const a = p.a_idle;
  const effective = tOut + p.prefill_share * tIn;
  const marg = p.j_node * effective / 3600 * p.pue_room;
  const idleOn = 1 - p.already_on;
  const fixed = p.node_usd / p.life + p.node_admin_h_year * p.wage;
  const hyperUsd = tokensUsd(tIn, tOut, 0, p.p_in, p.p_out);
  const openUsd = tokensUsd(tIn, tOut, 0, p.p_open_in, p.p_open_out);
  const coloWh = block * p.e_prompt / p.pue_hyper * p.pue_colo * idleMult(p.u_colo, a) / idleMult(p.u_hyper, a);
  const hyperWh = block * p.e_prompt;
  const fallbackWh = (1 - p.local_coverage) * block * p.e_prompt;
  const fallbackUsd = (1 - p.local_coverage) * block * hyperUsd;
  const out = {
    hyper: four([L.dc(hyperWh)], block * hyperUsd),
    hyper_same_grid: four([layer(hyperWh, p.grid_local, p.wue_site, genWater(p, p.gen_local), 'local', 'dc', 'local')], block * hyperUsd),
    colo: four([layer(coloWh, p.grid_colo, p.wue_site, genWater(p, p.gen_colo), 'cloud', 'dc', 'colo')], block * openUsd),
  };
  const idleRead = {};
  for (const [name, n] of [['node_100k', p.node_prompts_100k], ['node_1m', p.node_prompts_1m]]) {
    const idle = idleOn * p.node_w * HOURS / n * p.pue_room;
    const wh = block * (marg + idle);
    const usd = (fixed + wh / 1000 * n / block * p.tariff) / n * block;
    out[name] = four([L.room(wh)], usd);
    out[`${name}_hydro`] = four([L.hydro(wh)], usd);
    out[`${name}_fallback`] = four([L.room(wh), L.dc(fallbackWh)], usd + fallbackUsd);
    idleRead[name] = block * idle;
  }
  const laptopWh = block * p.j_laptop * effective / 3600;
  const phoneWh = block * p.j_phone_query / 3600;
  const phoneWall = phoneWh * p.phone_source_charge_eff * (1 + p.charger_overhead);
  const kwhUsd = (wh) => wh / 1000 * p.tariff_home;
  out.laptop = four([L.home(laptopWh)], kwhUsd(laptopWh));
  out.laptop_with_fallback = four([L.home(laptopWh), L.dc(fallbackWh)], kwhUsd(laptopWh) + fallbackUsd);
  out.phone = four([L.home(phoneWh)], kwhUsd(phoneWh));
  out.phone_wall = four([L.home(phoneWall)], kwhUsd(phoneWall));
  out.phone_wall_fallback = four([L.home(phoneWall), L.dc(fallbackWh)], kwhUsd(phoneWall) + fallbackUsd);
  out.readings = {
    token_chain_wh: block * tokensWh(tIn, tOut, 0, p),
    hyper_at_mean_prompt_wh: block * p.e_prompt_mean,
    hyper_small_model_usd: block * tokensUsd(tIn, tOut, 0, p.p_small_in, p.p_small_out),
    node_marginal_wh: block * marg,
    node_idle_wh: idleRead,
    fallback_wh: fallbackWh,
    embodied_hyper_g: block * (tIn + tOut) / 1e6 * p.emb_tokens_kg_m * 1000,
    embodied_node_g_100k: p.emb_desktop_kg / p.life * 1000 / p.node_prompts_100k * block,
    embodied_node_g_1m: p.emb_desktop_kg / p.life * 1000 / p.node_prompts_1m * block,
    gpu_cost_swing: p.gpu_cost_high / p.gpu_cost_low,
  };
  return [out, { marg, fixed, hyper_usd: hyperUsd, open_usd: openUsd }];
}

function crossovers(p, d) {
  const boxWh = p.mini_w * HOURS * p.pue_room;
  const stream = p.stream_w * p.pue_room;
  const gb = p.gb_phone;
  const measured = p.i_dc_measured * gb;
  const desnz = p.i_dc_desnz * gb;
  const platNet = gb * p.net_fixed_avg;
  const margNet = gb * p.net_fixed_marg;
  const nodeWh = p.node_w * HOURS * p.pue_room;
  const { marg, fixed } = d;
  const e = p.e_prompt;
  const nodeG = marg * p.grid_hydro;
  const hyperG = e * p.grid_dc;
  const embHyper = (p.tok_in_median + p.tok_out_median) / 1e6 * p.emb_tokens_kg_m * 1e6;
  const embNode = p.emb_desktop_kg / p.life * 1e6;
  const margUsd = marg / 1000 * p.tariff;
  return {
    views_measured_same_network: positive(boxWh, measured - stream),
    views_desnz_same_network: positive(boxWh, desnz - stream),
    views_measured_network_credit: positive(boxWh, measured + platNet - stream - margNet),
    views_desnz_network_credit: positive(boxWh, desnz + platNet - stream - margNet),
    prompts_energy_vs_hyper: positive(nodeWh, e - marg),
    prompts_carbon_same_grid: positive(nodeWh * p.grid_local, (e - marg) * p.grid_local),
    prompts_carbon_on_hydro_vs_hyper_us: positive(nodeWh * p.grid_hydro, hyperG - nodeG),
    prompts_carbon_on_hydro_with_embodied: positive(nodeWh * p.grid_hydro + embNode, hyperG + embHyper - nodeG),
    prompts_price_vs_hyper_list: positive(fixed, d.hyper_usd - margUsd),
    prompts_price_vs_open_weight_host: positive(fixed, d.open_usd - margUsd),
  };
}

function levers(p, cat, c, b, cc, d, L) {
  const block = p.prompts_block;
  const it = block * p.e_prompt / p.pue_hyper;
  const noCacheWh = p.coding_turns * tokensWh(p.coding_fresh + p.coding_cached, p.coding_out, 0, p);
  const noCacheUsd = p.coding_turns * tokensUsd(p.coding_fresh + p.coding_cached, p.coding_out, 0, p.p_in, p.p_out);
  const views = p.views_block;
  const gb = p.gb_phone;
  const plain = four([L.dc(block * p.e_prompt)], block * c.prompt_usd);
  const onlyCarbon = (share) => Object.assign({}, plain, { g: plain.g * (1 - share) });
  const genDc = genWater(p, p.gen_dc);
  return {
    route_small: {
      before: plain,
      after: four([L.dc(block * p.e_prompt / p.small_model_factor)], block * tokensUsd(p.tok_in_short, p.tok_out_short, 0, p.p_small_in, p.p_small_out)),
    },
    reasoning_off: {
      before: four([L.dc(block * p.e_prompt * p.reasoning_energy_mult)], block * tokensUsd(p.tok_in_short, p.tok_out_short * p.reasoning_output_mult, 0, p.p_in, p.p_out)),
      after: plain,
    },
    cache_prefix: { before: four([L.dc(noCacheWh)], noCacheUsd), after: { wh: cat.coding_session.wh, usd: cat.coding_session.usd, g: cat.coding_session.g, ml: cat.coding_session.ml, by: cat.coding_session.by } },
    cache_title: {
      before: b.platform,
      after: four([L.dc(views * gb * p.i_dc * (1 - p.cache_hit)), L.net((views * (1 - p.cache_hit) + 1) * gb * c.i_net), L.room(views * gb * p.cache_hit * b.readings.cache_wh_per_gb)], b.platform.usd),
    },
    pool_demand: { before: d.node_100k, after: d.node_1m },
    carbon_time: { before: plain, after: onlyCarbon(p.carbon_temporal) },
    carbon_place: { before: plain, after: onlyCarbon(p.carbon_spatial) },
    cooling: {
      before: four([layer(it * p.pue_tower, p.grid_dc, p.wue_tower, genDc, 'cloud', 'dc', 'dc')], plain.usd),
      after: four([layer(it * p.pue_dry, p.grid_dc, p.wue_local, genDc, 'cloud', 'dc', 'dc')], plain.usd),
    },
    local_clean_power: { before: d.node_1m, after: d.node_1m_hydro, solar_g: d.node_1m.wh * p.grid_solar / 1000 },
    query_in_place: { before: cc.ten_copies, after: cc.federated },
  };
}

// One unit of each Your Use row: a prompt, an hour, an image, a gigabyte-week. Only the terms the row owns, so time is counted once.
function pick(row, factor, tags, usd) {
  const parts = tags.map((tag) => row.by[tag] || { wh: 0, g: 0, ml: 0 });
  const by = {};
  tags.forEach((tag, i) => { by[tag] = { wh: parts[i].wh * factor, g: parts[i].g * factor, ml: parts[i].ml === null ? null : parts[i].ml * factor }; });
  const sum = (m, only = tags) => tags.reduce((all, tag) => (!only.includes(tag) ? all : by[tag][m] === null || all === null ? null : all + by[tag][m]), 0);
  const out = { wh: sum('wh'), g: sum('g'), ml: sum('ml'), usd, by, feeds: [...new Set(tags.map((tag) => (tag === 'dev' || tag === 'rou' ? 'home' : 'dc')))] };
  if (out.ml !== null && out.feeds.length > 1) out.ml_by_place = { cloud: sum('ml', ['net', 'dc']), home: sum('ml', ['dev', 'rou']) };
  return out;
}
function yourUnits(p, cat, hour, L) {
  const counted = p.router_allocation === 'by_data' ? ['net', 'dc', 'rou'] : ['net', 'dc'];
  const timed = p.router_allocation === 'by_time' ? ['dev', 'rou'] : ['dev'];
  const weekOfMonths = WEEK * 12 / HOURS;
  return {
    screen: pick(cat.video_hour, 1, timed, null),
    chat: pick(cat.chat_hour, 1 / p.prompts_per_hour, counted, cat.chat_hour.usd / p.prompts_per_hour),
    coding: pick(cat.coding_hour, 1, counted, cat.coding_hour.usd),
    images: pick(hour.image, 1 / p.images_per_hour, counted, cat.image.usd),
    clips: pick(hour.clip, 1 / p.clips_per_hour, counted, cat.clip.usd),
    searches: pick(hour.search, 1 / p.searches_per_hour, counted, cat.search_ai.usd),
    social: pick(cat.short_hour, 1, counted, cat.short_hour.usd),
    streaming: pick(cat.video_hour, 1, counted, cat.video_hour.usd),
    gb: four([L.dc(1 / 1000 * p.stor_wh_tb_h * WEEK * p.replicas * p.pue_hyper)], p.p_s3 * weekOfMonths),
    seat: pick(cat.seat_month, weekOfMonths, ['dc'], p.seat_usd * weekOfMonths),
  };
}

function compute(p) {
  const genDc = genWater(p, p.gen_dc);
  const genHome = genWater(p, p.gen_home);
  const genLocal = genWater(p, p.gen_local);
  const homeLayer = (tag) => (wh) => layer(wh, p.grid_home, 0, genHome, 'home', tag, 'home');
  const L = {
    dc: (wh) => layer(wh, p.grid_dc, p.wue_site, genDc, 'cloud', 'dc', 'dc'),
    net: (wh) => layer(wh, p.grid_dc, 0, genDc, 'cloud', 'net', 'dc'),
    router: homeLayer('rou'),
    device: homeLayer('dev'),
    home: homeLayer('dev'),
    room: (wh) => layer(wh, p.grid_local, p.wue_local, genLocal, 'local', 'dc', 'local'),
    hydro: (wh) => layer(wh, p.grid_hydro, p.wue_local, p.hydro_conv, 'local', 'dc', 'hydro'),
  };
  const sh = sameHour(p);
  const [cat, c] = catalog(p, sh, L);
  const hour = hourBaseline(p, cat, c, L);
  const A = office(p, c, L);
  const B = video(p, c, L);
  const C = data(p, c, L);
  const [D, dc] = prompts(p, L);
  return {
    same_hour: sh, catalog: cat, hour, where: whereItRuns(p, cat), arch: { A, B, C, D }, cross: crossovers(p, dc),
    lever: levers(p, cat, c, B, C, D, L), use: yourUnits(p, cat, hour, L), p,
  };
}

// ---------------------------------------------------------------- settings, spreads, and what moves a figure
function baseOf(D, settings) {
  const base = {};
  for (const [key, v] of Object.entries(D.inputs)) base[key] = v[0];
  Object.assign(base, D.scenario);
  for (const sel of Object.values(D.sel)) Object.assign(base, sel.opts[sel.def]);
  for (const [key, [name, option, setting]] of Object.entries(D.from_sel)) base[key] = D.sel[name].opts[option][setting];
  for (const [name, option] of Object.entries(settings || {})) Object.assign(base, D.sel[name].opts[option]);
  return base;
}
// Same procedure as input_extremes and rank_drivers in Python, over any figure read from a run of the model.
class Run {
  constructor(D, settings) {
    this.D = D;
    this.base = baseOf(D, settings);
    this.tree = compute(this.base);
    this.swept = Object.keys(D.inputs).filter((k) => D.inputs[k][1] !== D.inputs[k][0] || D.inputs[k][2] !== D.inputs[k][0]);
    this.ends = new Map();
    this.memo = new Map();
  }
  get oat() {
    if (!this.oat_) this.oat_ = this.swept.map((k) => [compute({ ...this.base, [k]: this.D.inputs[k][1] }), compute({ ...this.base, [k]: this.D.inputs[k][2] })]);
    return this.oat_;
  }
  get runs() {
    if (!this.runs_) {
      this.runs_ = Object.entries(this.D.sel).map(([name, sel]) => [name, Object.keys(sel.opts).map((o) => [o, compute({ ...this.base, ...sel.opts[o] })])]);
    }
    return this.runs_;
  }
  spread(id, fn) {
    if (this.memo.has(id)) return this.memo.get(id);
    const c = fn(this.tree);
    let out = [null, null];
    if (!blank(c)) {
      const ups = this.oat.map(([lo, hi]) => { const a = fn(lo); const b = fn(hi); return blank(a) || blank(b) || b >= a ? 1 : 0; });
      const sign = ups.join('');
      if (!this.ends.has(sign)) {
        const at = (up) => { const q = { ...this.base }; this.swept.forEach((k, i) => { q[k] = this.D.inputs[k][ups[i] === up ? 1 : 2]; }); return compute(q); };
        this.ends.set(sign, [at(0), at(1)]);
      }
      const [lo, hi] = this.ends.get(sign);
      const vals = [c, fn(lo), fn(hi)].filter((v) => !blank(v));
      out = [Math.min(...vals), Math.max(...vals)];
    }
    this.memo.set(id, out);
    return out;
  }
  drivers(fn) {
    const entries = [];
    this.oat.forEach(([lo, hi], i) => {
      const a = fn(lo);
      const b = fn(hi);
      if (!blank(a) && !blank(b) && a !== b) entries.push({ name: this.swept[i], type: 'input', at_low: a, at_high: b, swing: Math.abs(b - a) });
    });
    for (const [name, options] of this.runs) {
      const vals = options.map(([o, t]) => [o, fn(t)]).filter(([, v]) => !blank(v));
      if (new Set(vals.map(([, v]) => v)).size > 1) {
        const lo = vals.reduce((m, v) => (v[1] < m[1] ? v : m));
        const hi = vals.reduce((m, v) => (v[1] > m[1] ? v : m));
        entries.push({ name, type: 'setting', at_low: lo[1], at_high: hi[1], low_option: lo[0], high_option: hi[0], swing: hi[1] - lo[1] });
      }
    }
    return entries.sort((a, b) => b.swing - a.swing);
  }
  // A crossover as a range: the central count, the low and high from one change, and every change under which it never comes.
  crossover(key) {
    const value = this.tree.cross[key];
    const hits = blank(value) ? [] : [[value, null]];
    const never = blank(value) ? [null] : [];
    const see = (t, name) => { const v = t.cross[key]; if (!blank(v)) hits.push([v, name]); else if (!blank(value)) never.push(name); };
    this.oat.forEach(([lo, hi], i) => { see(lo, [this.swept[i], 1]); see(hi, [this.swept[i], 2]); });
    for (const [name, options] of this.runs) for (const [o, t] of options) see(t, [name, o]);
    const low = hits.reduce((m, v) => (!m || v[0] < m[0] ? v : m), null);
    const high = hits.reduce((m, v) => (!m || v[0] > m[0] ? v : m), null);
    return { value, low: low && low[0], high: high && high[0], low_by: low && low[1], high_by: high && high[1], never };
  }
}

// Numbers as the tree holds them, for the oracle: as Python's flatten, with the page's own helpers left out.
function flatten(tree, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(tree)) {
    if (k === 'by' || k === 'p' || k === 'use' || k === 'places' || k === 'feeds') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else if (typeof v === 'number') out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------- figures in words
const grouped = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(v);
// Two significant figures, three at 100 and above; d overrides. Below 1 no trailing zero: 0.0008, not 0.00080.
function num(v, d) {
  const a = Math.abs(v);
  if (!a) return '0';
  if (a >= 99.5) return grouped(Number(v.toPrecision(d || 3)));
  const s = v.toPrecision(d || 2);
  return Math.abs(+s) < 1 ? String(+s) : s;
}
const cents = (s) => (+s && s.length < 4 ? (+s).toFixed(2) : s); // money keeps its cents below a dollar: $0.20, $0.04, $0.004
const usd = (v) => (Math.abs(v) >= 100 ? `$${grouped(Number(v.toPrecision(3)))}` : Math.abs(v) >= 1 ? `$${v.toFixed(2)}` : `$${cents(num(v))}`);
const SCALE = { wh: [[1e7, 1e6, 'MWh'], [1e4, 1e3, 'kWh'], [0, 1, 'Wh']], g: [[1e7, 1e6, 't CO2e'], [1e4, 1e3, 'kg CO2e'], [0, 1, 'g CO2e']], ml: [[1e3, 1e3, 'L'], [0, 1, 'mL']] };
const scaleOf = (v, m) => SCALE[m].find(([from]) => Math.abs(v) >= from);
function figure(v, lo, hi, m, at) { // num, unit, and the spread as a tag: the one form every value and table cell reads
  if (blank(v)) return { num: 'no price', unit: '', tag: '' };
  if (m === 'usd') return { num: usd(v), unit: '', tag: !blank(lo) && usd(lo) !== usd(hi) ? `(${usd(lo)} to ${usd(hi)})` : '' };
  const [, div, unit] = at || scaleOf(v, m);
  const n = (x) => num(x / div);
  return { num: n(v), unit, tag: !blank(lo) && n(lo) !== n(hi) ? `(${n(lo)} to ${n(hi)})` : '' };
}
const words = (f) => [f.num, f.tag, f.unit].filter(Boolean).join(' ');
const plainFig = (v, m) => (m === 'usd' ? usd(v) : words(figure(v, null, null, m)));
const leverText = (v, m) => (blank(v) ? 'no figure' : plainFig(v, m));
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const niceStep = (x) => { const e = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].find((s) => s * e >= x) * e; };
const TAGS = ['dev', 'rou', 'net', 'dc'];
const MS = ['wh', 'usd', 'g', 'ml'];
const FEED = { dc: ['grid_dc', 'gen_dc'], fixed: ['grid_dc'], cloud: ['grid_dc', 'gen_dc'], home: ['grid_home', 'gen_home'], local: ['grid_local', 'gen_local'], colo: ['grid_colo', 'gen_colo'] };

// What the page says at one state of the settings. Pure, so the build can print the same words the page computes.
function Views(D) {
  const V = {};
  const at = (t, key) => key.split('.').reduce((o, k) => (blank(o) ? o : o[k]), t);
  V.at = at;
  V.fresh = () => ({
    settings: Object.fromEntries(Object.entries(D.sel).map(([k, s]) => [k, s.def])), fields: { ...D.fields }, mode: 'person', seats: D.scenario.office_users, m: 'wh',
    opts: { workload: 'prompt', comparison: 'A', crossover: 'prompts', waffle: 'iea_2025', sort: 'value', scale: 'hour' }, sel: { ...D.first },
  });
  V.set = (S) => { V.S = S; V.run = new Run(D, S.settings); V.p = V.run.base; V.t = V.run.tree; };
  const seats = () => (V.S.mode === 'office' ? V.S.seats : 1);
  const count = (key) => (!key.startsWith('use.') ? 1 : key === 'use.seat' ? seats() : (V.S.fields[key.slice(4)] || 0) * seats());
  const row = (key) => at(V.t, key);
  const val = (key, m) => { const v = row(key)[m]; return blank(v) ? v : v * count(key); };
  const sayOf = (name) => D.sel[name].say[V.S.settings[name]];
  V.val = val;
  V.count = count;
  V.spread = (key, m) => V.run.spread(`${key}:${m}`, (t) => at(at(t, key), m)).map((x) => (blank(x) ? x : x * count(key)));
  V.parts = (key, m) => Object.fromEntries(TAGS.map((tag) => [tag, (row(key).by?.[tag]?.[m] || 0) * count(key)]));
  V.basis = (key) => D.rows[key]?.pb || 'none';
  V.label = (key) => D.rows[key].label.replace(/\{(\w+)\}/g, (all, k) => (k === 'kind' ? sayOf('chat_kind') : k === 'device' ? sayOf('device').toLowerCase() : k === 'link' ? sayOf('connection') : grouped(V.S.fields[k] ?? V.S.seats))).replace(/, 1 (hour|prompt)s\b/, ', 1 $1');
  const basinWord = (place) => D.words.basin[place] || 'basin not stated';
  V.basin = (place) => {
    const kind = place === 'hydro' ? 'hydro' : place === 'fixed' ? 'fixed' : V.p[FEED[place]?.[1]];
    const conv = kind === 'fixed' ? sayOf('dc_generation_water') : kind === 'none' || !kind ? 'no generation water in the record' : sayOf('hydro_convention');
    return `${basinWord(place)}, ${conv}`;
  };
  V.water = (key) => {
    const r = row(key);
    if (blank(r.ml)) return [];
    if (!r.ml_by_place) { const [lo, hi] = V.spread(key, 'ml'); return [{ place: (r.feeds || ['dc'])[0], v: val(key, 'ml'), lo, hi }]; }
    return Object.keys(r.ml_by_place).sort().map((place) => {
      const [lo, hi] = V.run.spread(`${key}:ml:${place}`, (t) => at(at(t, key), 'ml_by_place')?.[place]).map((x) => (blank(x) ? x : x * count(key)));
      return { place, v: r.ml_by_place[place] * count(key), lo, hi };
    });
  };
  V.grids = (key) => [...new Set(row(key).feeds || ['dc'])].map((f) => (f === 'hydro' ? `${D.words.basin.hydro}, ${V.p.grid_hydro} g per kWh` : `${sayOf(FEED[f][0])}, ${V.p[FEED[f][0]]} g per kWh`)).join('; ');
  V.cell = (key, m, at) => {
    if (m === 'usd') {
      const [lo, hi] = V.spread(key, 'usd');
      const v = val(key, 'usd');
      const f = figure(v, lo, hi, 'usd');
      return blank(v) ? { num: f.num, unit: '', tag: D.rows[key].pn || '' } : { num: f.num, unit: '', tag: [D.rows[key].pt || D.words.price[V.basis(key)], f.tag].filter(Boolean).join(' ') };
    }
    if (m === 'ml') {
      const parts = V.water(key);
      if (!parts.length) return { num: 'no figure', unit: '', tag: 'no generation water in the record for this feed' };
      if (parts.length === 1) return figure(parts[0].v, parts[0].lo, parts[0].hi, 'ml', at);
      const [, div, unit] = at || scaleOf(Math.max(...parts.map((p) => p.v)), 'ml');
      return { num: parts.map((p) => num(p.v / div)).join(' and '), unit, tag: 'two basins, never summed' };
    }
    const [lo, hi] = V.spread(key, m);
    return figure(val(key, m), lo, hi, m, at);
  };
  V.boardKeys = (id, m) => {
    const spec = D.boards[id];
    const list = (m === 'usd' ? spec.price : m === 'wh' ? spec.energy : spec.grid) || spec.rows;
    return id === 'use' ? list.filter((key) => key !== 'use.seat' || V.S.mode === 'office') : [...list, ...(m === 'g' || m === 'ml' ? spec.scenario || [] : [])];
  };
  V.boardScale = (id, m) => (m === 'usd' ? null : scaleOf(Math.max(0, ...V.boardKeys(id, m).map((key) => Math.abs(val(key, m) || 0))), m)); // one unit down a board
  V.rowCell = (key, m, at) => { // the Catalog carries the price basis as a tag on every row, whatever the measure
    const f = V.cell(key, m, at);
    return m !== 'usd' && /^(catalog|hour)\./.test(key) ? { ...f, tag: [f.tag, D.words.price[V.basis(key)]].filter(Boolean).join(' ') } : f;
  };
  // A wall's geometry, as fractions of the track: one scale on both sides; the longest row fills 92 percent of its side.
  V.layout = (keys, m, plain, at) => {
    const rows = keys.map((key) => [key, V.parts(key, m)]);
    const L = Math.max(0, ...rows.map(([, p]) => p.dev + p.rou));
    const R = Math.max(0, ...rows.map(([, p]) => p.net + p.dc));
    const wall = plain ? 0 : Math.min(0.45, Math.max(0.14, L / ((L + R) || 1)));
    const s = Math.min(L ? 0.92 * wall / L : Infinity, R ? 0.92 * (1 - wall) / R : Infinity);
    const scale = Number.isFinite(s) ? s : 0;
    const items = {};
    for (const [key, p] of rows) {
      const left = p.dev + p.rou;
      const right = p.net + p.dc;
      const start = wall - left * scale;
      const item = { dev: [start, p.dev * scale], rou: [wall - p.rou * scale, p.rou * scale], net: [wall, p.net * scale], dc: [wall + p.net * scale, p.dc * scale], end: right ? wall + right * scale : start };
      if (m !== 'ml') {
        const [lo, hi] = V.spread(key, m);
        if (!blank(lo) && hi > lo) {
          if (right) { // the total runs from the bar's start, so the needle sits inside the spread
            const a = Math.min(start + lo * scale, 1);
            const b = start + hi * scale;
            item.range = [a, Math.min(b, 1) - a, b > 1 ? 'is-off' : ''];
          } else { // a row all on the reader's side grows left from the wall, and so does its spread
            const a = wall - hi * scale;
            item.range = [Math.max(a, 0), wall - lo * scale - Math.max(a, 0), a < 0 ? 'is-off-left' : ''];
          }
        }
      }
      items[key] = item;
    }
    const ticks = [];
    if (scale) {
      const reach = (1 - wall) / scale;
      const [, div, unit] = at || scaleOf(reach, m);
      const step = niceStep(reach / 4);
      const mark = (v, x) => ticks.push({ x, t: grouped(Number((v / div).toPrecision(3))) });
      for (let k = 1; wall + k * step * scale < 0.97; k += 1) mark(k * step, wall + k * step * scale);
      const stepLeft = L ? niceStep(wall / scale / 2) : 0;
      for (let k = 1; L && wall - k * stepLeft * scale > 0.03; k += 1) mark(k * stepLeft, wall - k * stepLeft * scale);
      ticks.sort((a, b) => a.x - b.x);
      if (ticks.length) ticks[ticks.length - 1].t += ` ${unit}`; // the wall is the zero; the far tick carries the unit
    }
    return { wall, items, ticks };
  };
  const logAxis = (ends, label) => {
    const d0 = Math.floor(Math.log10(Math.min(...ends)));
    const d1 = Math.ceil(Math.log10(Math.max(...ends)) + 0.001);
    const x = (v) => (Math.log10(v) - d0) / (d1 - d0);
    const ticks = [];
    for (let e = d0; e <= d1; e += 1) ticks.push({ x: x(10 ** e), t: label(10 ** e, e === d1) });
    return { x, ticks };
  };
  V.ruler = (keys, m) => { // the log ruler for rows by the unit
    const ends = keys.flatMap((key) => [...V.spread(key, m), val(key, m)]).filter((v) => v > 0);
    if (!ends.length) return { items: {}, ticks: [] };
    const [, div, unit] = scaleOf(Math.max(...ends), m);
    const { x, ticks } = logAxis(ends, (v, last) => `${grouped(Number((v / div).toPrecision(3)))}${last ? ` ${unit}` : ''}`);
    const items = {};
    for (const key of keys) {
      const v = val(key, m);
      const [lo, hi] = V.spread(key, m);
      items[key] = v > 0 ? { x: x(v), lo: lo > 0 ? x(lo) : undefined, hi: hi > 0 ? x(hi) : undefined } : {};
    }
    return { items, ticks };
  };
  V.crossings = (keys) => {
    const items = Object.fromEntries(keys.map((key) => [key, V.run.crossover(key.slice(6))]));
    const ends = Object.values(items).flatMap((c) => [c.value, c.low, c.high]).filter((v) => v > 0);
    const { x, ticks } = logAxis(ends, (v) => grouped(v));
    for (const c of Object.values(items)) Object.assign(c, { x: c.value > 0 ? x(c.value) : undefined, xlo: c.low > 0 ? x(c.low) : undefined, xhi: c.high > 0 ? x(c.high) : undefined });
    return { items, ticks };
  };
  V.crossWords = (c, noun) => {
    const span = blank(c.low) || c.low === c.high ? '' : `${num(c.low, 2)} to ${num(c.high, 2)}`;
    const never = c.never.length && !blank(c.value) ? ', or never' : '';
    return { num: blank(c.value) ? 'never' : num(c.value, 2), unit: blank(c.value) ? '' : noun, tag: span ? `(${span}${never})` : never ? '(or never)' : '' };
  };
  const endWords = (by) => (!by ? 'no single change moves it this way' : by[1] === 1 || by[1] === 2 ? `${D.names[by[0]] || by[0]} at its ${by[1] === 1 ? 'low' : 'high'} end` : `${D.names[by[0]] || by[0]}: ${D.sel[by[0]].say[by[1]]}`);
  V.crossEnds = (c) => `Low end: ${endWords(c.low_by)}. High end: ${endWords(c.high_by)}.${c.never.length && !blank(c.value) ? ` It never comes under ${c.never.filter(Boolean).slice(0, 2).map(endWords).join(' or ')}.` : ''}`;
  V.lever = (key, m) => {
    const lever = row(key);
    const a = lever.before[m];
    const b = lever.after[m];
    const top = Math.max(a || 0, b || 0) * 1.08 || 1;
    return { before: a, after: b, ratio: blank(a) || blank(b) || !a ? null : b / a, xBefore: blank(a) ? undefined : a / top, xAfter: blank(b) ? undefined : b / top };
  };
  V.moves = (key, m) => {
    const k = count(key);
    const [top] = V.run.drivers((t) => at(at(t, key), m));
    if (!top) return '';
    const name = D.names[top.name] || top.name;
    const span = m === 'ml' ? '' : `, ${plainFig(top.at_low * k, m)} to ${plainFig(top.at_high * k, m)}`;
    return top.type === 'setting' ? `${name}: ${D.sel[top.name].say[top.low_option]} to ${D.sel[top.name].say[top.high_option]}${span}` : `${name}${span}`;
  };
  V.detailOf = (key, m = 'wh') => {
    const wh = V.cell(key, 'wh');
    const price = V.cell(key, 'usd');
    const g = V.cell(key, 'g');
    const water = V.water(key);
    const parts = V.parts(key, 'wh');
    const by = row(key).by || {};
    const wall = TAGS.includes('dev') && row(key).by?.dev && V.S.settings.device === 'phone' && !key.startsWith('where.') && !key.startsWith('arch.') ? parts.dev * (1 + V.p.charger_overhead) : null;
    const spread = wh.tag ? `Spread, not a confidence interval: ${wh.tag.slice(1, -1)} ${wh.unit}.` : 'No spread on this row\'s energy at these settings.';
    return {
      value: wh.num, unit: wh.unit, qual: [D.rows[key].unit, wh.tag.slice(1, -1)].filter(Boolean).join(', '),
      price: price.num, priceTag: blank(val(key, 'usd')) ? D.rows[key].pn || D.words.priceLong.none : `${D.rows[key].pt || D.words.priceLong[V.basis(key)]}, ${D.price_date}`,
      co2: g, co2Tag: `${V.grids(key)}, location-based`,
      water: water.map((part) => ({ ...figure(part.v, null, null, 'ml'), tag: V.basin(part.place) })),
      layers: TAGS.map((tag) => ({ tag, on: !!by[tag], text: by[tag] ? plainFig(parts[tag], 'wh') : 'not counted', label: D.words.layer[tag] })),
      spread: wall ? `${spread} The phone's line is battery energy; ${num(wall)} Wh at the wall.` : spread,
      moves: V.moves(key, m) ? `Moves it most: ${V.moves(key, m)}.` : '',
      reading: `${V.label(key)}: ${words(wh)}, ${blank(val(key, 'usd')) ? 'no price' : `${price.num} ${D.words.price[V.basis(key)]}`}, ${words({ ...g, tag: '' })}, water ${water.length ? water.map((part) => `${plainFig(part.v, 'ml')} (${basinWord(part.place)})`).join(' and ') : 'not in the record'}. Modeled, not measured.`,
    };
  };
  V.leverDetail = (key, m = 'wh') => {
    const r = V.lever(key, m);
    return {
      value: blank(r.ratio) ? 'no figure' : num(r.ratio), unit: '', qual: `after over before, ${D.words.measure[m]}`,
      lines: MS.map((x) => { const q = V.lever(key, x); return `${D.words.measure[x]}: ${leverText(q.before, x)} then ${leverText(q.after, x)}${blank(q.ratio) ? '' : `, ${num(q.ratio)}`}`; }),
      reading: `${V.label(key)}: ${leverText(r.before, m)} before, ${leverText(r.after, m)} after, at the same setting. Modeled, not measured; a per-unit saving is not a total one.`,
    };
  };
  V.crossDetail = (key, noun) => {
    const c = V.run.crossover(key.slice(6));
    const f = V.crossWords(c, noun);
    return { value: f.num, unit: f.unit, qual: [f.tag.slice(1, -1), blank(c.value) ? noun : ''].filter(Boolean).join(' '), ends: V.crossEnds(c), reading: `${V.label(key)}: ${words(f)}. A range from one change at a time, not a forecast.` };
  };
  // Your week across the rows: the screen and router, what the activities add, carbon as a sum, water by basin, and price in three lines, never one sum.
  V.week = () => {
    const office = V.S.mode === 'office';
    const keys = D.boards.use.rows.filter((key) => key !== 'use.screen' && (key !== 'use.seat' || office) && !(key === 'use.gb' && office)); // the seat's 2011 figure holds storage, so storage prints beside
    const sum = (list, m) => list.reduce((all, key) => all + (val(key, m) || 0), 0);
    const added = keys.map((key) => [key, val(key, 'wh')]).sort((a, b) => b[1] - a[1]);
    const left = V.parts('use.screen', 'wh');
    const water = { home: 0, cloud: 0 };
    let noWater = false;
    for (const key of [...keys, 'use.screen']) {
      if (blank(row(key).ml)) noWater = true;
      else for (const part of V.water(key)) water[part.place === 'dc' ? 'cloud' : part.place] += part.v;
    }
    const by = (basis) => sum(D.boards.use.rows.filter((key) => (key !== 'use.seat' || office) && V.basis(key) === basis), 'usd');
    const total = sum(keys, 'wh');
    return {
      screen: left.dev + left.rou, added: total, largest: added[0][1] > 0 ? added[0][0] : null, share: added[0][1] / (total || 1), g: sum([...keys, 'use.screen'], 'g'), water, noWater,
      list: by('api_list'), earned: by('revenue_standin'), seat: by('seat_list'),
    };
  };
  V.title = () => {
    const w = V.week();
    const who = V.S.mode === 'office' ? `for ${grouped(V.S.seats)} seats ` : '';
    const largest = w.largest ? `${w.share > 0.5 ? 'most of it' : 'the largest share'} ${D.rows[w.largest].lower}` : 'none of it yet';
    return `In a week ${who}with ${grouped(V.S.fields.screen)} screen hours, the screen and router are ${plainFig(w.screen, 'wh')} and the activities add ${plainFig(w.added, 'wh')}, ${largest}; modeled, ${D.price_date.slice(0, 2)}/${D.price_date.slice(6)}.`;
  };
  V.table = (key) => {
    const r = row(key);
    const price = V.cell(key, 'usd');
    const water = V.water(key);
    return {
      wh: words(V.cell(key, 'wh')), usd: [price.num, price.tag].filter(Boolean).join(', '), g: words(V.cell(key, 'g')),
      ml: water.length ? water.map((part) => `${words(figure(part.v, part.lo, part.hi, 'ml'))}, ${basinWord(part.place)}`).join('; ') : (r.ml === null ? 'no figure in the record' : ''),
    };
  };
  V.reading = (key) => { // a figure beside the rows, live, with its spread where the spread means something
    const v = at(V.t, key);
    const name = key.split('.').slice(3).join('.');
    if (blank(v)) return 'no tie at these settings';
    const [lo, hi] = V.run.spread(`reading:${key}`, (t) => at(t, key));
    if (name.startsWith('ratio_')) return `${num(lo)} to ${num(hi)} times, a spread`;
    if (name.includes('tie')) return name.includes('wage') ? `$${num(v)} an hour` : `${num(v)} W`;
    if (name.includes('swing')) return `${num(v)} times`;
    if (name.includes('duplicate')) return `${num(v)} GB`;
    const m = name.includes('usd') ? 'usd' : /(^|_)g(_|$)/.test(name) ? 'g' : name.includes('ml') ? 'ml' : 'wh';
    return words(figure(v, lo, hi, m));
  };
  V.line = () => {
    const names = [...D.line, ...Object.keys(D.sel).filter((name) => !D.line.includes(name) && V.S.settings[name] !== D.sel[name].def)];
    const text = `${names.map(sayOf).join(', ')}.`;
    return text[0].toUpperCase() + text.slice(1);
  };
  return V;
}

const api = { compute, baseOf, Run, flatten, Views, num, usd, figure, words, pct, leverText, plainFig, FEED };
if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
window.explorer = api;

// ---------------------------------------------------------------- the page
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const on = (node, type, fn) => node.addEventListener(type, fn);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (!blank(text)) n.textContent = text; return n; };
const D = JSON.parse($('#explorer-data').textContent);
const V = Views(D);
const S = V.fresh();
Object.assign(api, { view: V, state: S, data: D });
const plateOf = (name) => $(`.x-plate[data-plate-x="${name}"]`);
const rowNodes = new Map($$('.plate-plot [data-row]').map((n) => [n.dataset.row, n]));
const tableRows = new Map($$('tr[data-tr]').map((n) => [n.dataset.tr, n]));
const shown = {}; // the keys a plate's arrows step through, in the order they stand

function cell(node, f) {
  const parts = [el('span', 'ladder-num', f.num)];
  if (f.unit) parts.push(' ', el('span', 'ladder-unit', f.unit));
  if (f.tag) parts.push(' ', el('span', 'ladder-tag', f.tag));
  node.replaceChildren(...parts);
}
function seg(node, range) {
  node.hidden = !(range && range[1] > 0);
  if (!node.hidden) { node.style.left = pct(range[0]); node.style.width = pct(range[1]); }
}
function axisInto(board, ticks) {
  const axis = $('.wall-axis, .ladder-axis', board);
  const place = (n, t) => { n.style.setProperty('--x', t.x.toFixed(4)); return n; };
  axis.replaceChildren(...ticks.map((t) => place(el('span', '', t.t), t)));
  const grid = $('.ladder-grid', board);
  if (grid) grid.replaceChildren(...ticks.map((t) => place(el('i'), t)));
}
function byBasis(board, keys) { // rows by price basis, with a rule between groups; a price is never ranked across bases
  const rank = (basis) => D.words.order.indexOf(basis);
  for (const head of $$('.wall-group[data-basis]', board)) { head.hidden = !keys.some((key) => V.basis(key) === head.dataset.basis); head.style.order = rank(head.dataset.basis) * 1000; }
  const sorted = [...keys].sort((a, b) => rank(V.basis(a)) - rank(V.basis(b)));
  sorted.forEach((key, i) => { rowNodes.get(key).style.order = rank(V.basis(key)) * 1000 + i + 1; });
  return sorted;
}
const bySize = (keys, m) => { const sorted = [...keys].sort((a, b) => (V.val(b, m) ?? -1) - (V.val(a, m) ?? -1)); sorted.forEach((key, i) => { rowNodes.get(key).style.order = i; }); return sorted; };
const feedGrid = (f) => (f === 'hydro' ? V.p.grid_hydro : V.p[FEED[f][0]]);
const oneGrid = (key) => (V.at(V.t, key).feeds || []).every((f) => feedGrid(f) === V.p.grid_local);

function paintWall(id) {
  const spec = D.boards[id];
  const board = $(`[data-board="${id}"]`);
  const { m } = S;
  const list = (m === 'usd' ? spec.price : m === 'wh' ? spec.energy : spec.grid) || spec.rows;
  const scenario = m === 'g' || m === 'ml' ? spec.scenario || [] : [];
  const visible = V.boardKeys(id, m);
  const at = V.boardScale(id, m);
  let wordsOnly = id.startsWith('arch.') && (m === 'g' || m === 'ml') ? list.filter((key) => !oneGrid(key)) : []; // different grids: words, no bar
  if (list.length - wordsOnly.length < 2 && wordsOnly.length) wordsOnly = list; // one bar alone compares with nothing
  board.dataset.measure = m;
  for (const key of spec.rows) { const n = rowNodes.get(key); n.hidden = !visible.includes(key); n.style.order = ''; }
  for (const head of $$('.wall-group', board)) { head.hidden = !(head.dataset.scenario !== undefined && scenario.length); head.style.order = ''; }
  let order = visible;
  if (m === 'usd' || (id === 'catalog.hour' && S.opts.sort === 'tag')) order = byBasis(board, visible);
  else if (id === 'catalog.hour') order = bySize(visible, m);
  if (scenario.length) { $('.wall-group[data-scenario]', board).style.order = 5000; scenario.forEach((key, i) => { rowNodes.get(key).style.order = 5001 + i; }); }
  const lay = V.layout(m === 'usd' ? [] : visible.filter((key) => !wordsOnly.includes(key)), m, spec.plain, at);
  board.style.setProperty('--wall', lay.wall.toFixed(4));
  for (const key of visible) {
    const n = rowNodes.get(key);
    const item = lay.items[key];
    const beside = key === 'use.gb' && S.mode === 'office';
    n.classList.toggle('is-beside', beside);
    for (const tag of TAGS) seg($(`.w-${tag}`, n), item && item[tag]);
    const range = $('.wall-range', n);
    range.hidden = !item?.range;
    if (item?.range) {
      range.style.left = pct(item.range[0]);
      range.style.width = pct(item.range[1]);
      range.className = `wall-range ${item.range[2]}`.trim();
    }
    const needle = $('.wall-needle', n);
    needle.hidden = !item;
    if (item) needle.style.left = pct(item.end);
    const f = V.rowCell(key, m, at);
    const extra = wordsOnly.includes(key) ? 'on another grid, no bar' : beside ? 'inside the seat figure; printed beside, not added' : '';
    cell($('.ladder-value', n), { ...f, tag: [f.tag, extra, item?.range?.[2] ? D.words.off : ''].filter(Boolean).join(' ') });
  }
  axisInto(board, lay.ticks);
  const note = $('.wall-gridnote', board);
  if (note) {
    note.hidden = !wordsOnly.length;
    note.textContent = wordsOnly.length ? `Rows on different grids carry no bar: ${[...new Set(wordsOnly.map(V.grids))].join(' against ')}, and the local grid is ${V.p.grid_local} g per kWh. Set them to one feed in Settings to draw them.` : '';
  }
  return [...order.filter((key) => !scenario.includes(key)), ...scenario];
}
function paintRuler(id) {
  const spec = D.boards[id];
  const board = $(`[data-board="${id}"]`);
  const { m } = S;
  board.dataset.measure = m;
  const lay = m === 'usd' ? { items: {}, ticks: [] } : V.ruler(spec.rows, m);
  const at = V.boardScale(id, m);
  for (const head of $$('.wall-group', board)) head.hidden = true;
  const order = m === 'usd' || S.opts.sort === 'tag' ? byBasis(board, spec.rows) : bySize(spec.rows, m);
  for (const key of spec.rows) {
    const n = rowNodes.get(key);
    const item = lay.items[key] || {};
    if (!blank(item.x)) n.style.setProperty('--x', item.x.toFixed(4));
    $('.ladder-mark', n).hidden = blank(item.x);
    const hasRange = !blank(item.lo) && !blank(item.hi) && item.hi > item.lo;
    if (hasRange) { n.style.setProperty('--lo', item.lo.toFixed(4)); n.style.setProperty('--hi', item.hi.toFixed(4)); } else { n.style.removeProperty('--lo'); n.style.removeProperty('--hi'); }
    $('.ladder-range', n).hidden = !hasRange;
    cell($('.ladder-value', n), V.rowCell(key, m, at));
  }
  axisInto(board, lay.ticks);
  return order;
}
function paintLevers() {
  const { m } = S;
  for (const key of D.boards.lever.rows) {
    const n = rowNodes.get(key);
    const r = V.lever(key, m);
    const has = !blank(r.xAfter) && !blank(r.xBefore);
    if (has) { n.style.setProperty('--x', r.xAfter.toFixed(4)); n.style.setProperty('--x2', r.xBefore.toFixed(4)); } else { n.style.removeProperty('--x'); n.style.removeProperty('--x2'); } // no figures, no line
    $$('.ladder-mark', n).forEach((mark) => { mark.hidden = !has; });
    cell($('.ladder-value', n), { num: blank(r.ratio) ? 'no figure' : num(r.ratio), unit: 'after over before', tag: `(${leverText(r.before, m)} then ${leverText(r.after, m)})` });
  }
  return D.boards.lever.rows;
}
function paintCross(id) {
  const spec = D.boards[id];
  const { items, ticks } = V.crossings(spec.rows);
  for (const key of spec.rows) {
    const n = rowNodes.get(key);
    const c = items[key];
    if (!blank(c.x)) n.style.setProperty('--x', c.x.toFixed(4));
    $('.ladder-mark', n).hidden = blank(c.x);
    const hasRange = !blank(c.xlo) && c.xhi > c.xlo;
    if (hasRange) { n.style.setProperty('--lo', c.xlo.toFixed(4)); n.style.setProperty('--hi', c.xhi.toFixed(4)); } else { n.style.removeProperty('--lo'); n.style.removeProperty('--hi'); }
    $('.ladder-range', n).hidden = !hasRange;
    const orNever = !blank(c.value) && c.never.length > 0; // the same test as the value column's words
    n.classList.toggle('is-or-never', orNever);
    $('.x-or-never', n).hidden = !orNever;
    cell($('.ladder-value', n), V.crossWords(c, spec.noun));
  }
  axisInto($(`[data-board="${id}"]`), ticks);
  return spec.rows;
}
const allOf = (prefix, paint, current) => { // every board stays live, so print and a later switch never show stale rows
  let order;
  for (const id of Object.keys(D.boards)) if (id.startsWith(prefix)) { const o = paint(id); if (id === current) order = o; }
  return order;
};
const painters = {
  use: () => paintWall('use'),
  where: () => allOf('where.', paintWall, `where.${S.opts.workload}`),
  arch: () => allOf('arch.', paintWall, `arch.${S.opts.comparison}`),
  lever: paintLevers,
  cross: () => allOf('cross.', paintCross, `cross.${S.opts.crossover}`),
  catalog: () => { const hour = paintWall('catalog.hour'); const unit = paintRuler('catalog.unit'); return S.opts.scale === 'unit' ? unit : hour; }, // both stay live; the arrows step the view shown
};
function paintTables() {
  for (const [key, tr] of tableRows) {
    if (key === 'use.seat') tr.hidden = S.mode !== 'office';
    const fill = (c, text) => { const td = $(`[data-c="${c}"]`, tr); if (td) td.textContent = text; };
    const th = $('th', tr);
    if (th) th.textContent = V.label(key);
    if (key.startsWith('lever.')) for (const m of MS) { const r = V.lever(key, m); fill(m, `${leverText(r.before, m)} then ${leverText(r.after, m)}${blank(r.ratio) ? '' : `, ${num(r.ratio)}`}`); }
    else if (!key.startsWith('cross.')) { const t = V.table(key); for (const m of MS) fill(m, t[m]); }
  }
  for (const id of ['cross.prompts', 'cross.views']) {
    const { items } = V.crossings(D.boards[id].rows);
    for (const [key, c] of Object.entries(items)) { const td = $('[data-c="count"]', tableRows.get(key)); td.textContent = words(V.crossWords(c, D.boards[id].noun)); $('[data-c="ends"]', tableRows.get(key)).textContent = V.crossEnds(c); }
  }
}

// The detail zone reads the same on every plate: the energy large, then price, carbon, and water with their bases, then the sentence.
function detail(name, key) {
  const plate = plateOf(name);
  const d = (k) => $(`[data-d="${k}"]`, plate);
  const text = (k, v) => { const n = d(k); if (n) n.textContent = v; };
  const noteId = D.rows[key]?.note;
  const long = () => d('value').parentElement.classList.toggle('is-long', d('value').textContent.length >= 8);
  const big = (node, f) => { node.replaceChildren(el('span', '', f.num), ' ', el('span', 'x-big-unit', f.unit)); return node; };
  const readout = (r) => { text('value', r.value); text('unit', r.unit); text('qual', r.qual); text('reading', r.reading); };
  if (key.startsWith('lever.')) {
    const r = V.leverDetail(key, S.m);
    readout(r);
    d('lines').replaceChildren(...r.lines.map((line) => el('li', '', line)));
  } else if (key.startsWith('cross.')) {
    const r = V.crossDetail(key, D.boards[`cross.${S.opts.crossover}`].noun);
    readout(r);
    text('ends', r.ends);
  } else {
    const r = V.detailOf(key, S.m);
    readout(r);
    text('price', r.price); text('price-tag', r.priceTag); big(d('co2'), r.co2); text('co2-tag', r.co2Tag);
    d('water').replaceChildren(...(r.water.length ? r.water.map((w) => { const s = el('span', 'x-figure'); s.append(big(el('strong', 'x-big'), w), el('span', 'caption', w.tag)); return s; }) : [el('span', 'caption', 'No water figure: the record holds no generation water for this feed.')]));
    d('layers').replaceChildren(...r.layers.map((l) => { const li = el('li'); li.append(el('span', `plate-square w-key-${l.tag}${l.on ? '' : ' is-hollow'}`), el('strong', '', l.text), el('span', '', l.label)); return li; }));
    text('spread', r.spread); text('moves', r.moves);
    const tokens = d('tokens');
    if (tokens) tokens.hidden = !D.rows[key]?.ai;
  }
  long();
  const master = noteId && document.getElementById(noteId);
  const note = d('note');
  note.replaceChildren(...(master ? [...master.cloneNode(true).children] : []));
  if (Object.keys(D.sel).some((k) => S.settings[k] !== D.sel[k].def)) note.prepend(el('p', 'x-note-title', 'These notes describe the default settings.'));
  for (const chip of $$('.receipt', note)) { const id = chip.getAttribute('href').slice(5); chip.lastElementChild.textContent = `${id}, ${document.getElementById(`src-${id}`).dataset.short}`; }
  const receipt = d('receipt');
  receipt.hidden = true;
  receipt.replaceChildren();
  d('sources').replaceChildren(...$$('.receipt', note).map((chip) => { const src = document.getElementById(chip.getAttribute('href').slice(1)).cloneNode(true); src.removeAttribute('id'); return src; }));
}
function selectRow(name, key, quiet) {
  S.sel[name] = key;
  const plate = plateOf(name);
  $$('.plate-plot [data-row]', plate).forEach((n) => {
    const hit = n.dataset.row === key;
    n.classList.toggle('is-on', hit);
    n.setAttribute('role', 'option');
    n.setAttribute('aria-selected', hit);
    if (hit) $('.plate-plot', plate).setAttribute('aria-activedescendant', n.id);
  });
  detail(name, key);
  if (!quiet) writeQuery();
}
function paintWeek() {
  const w = V.week();
  const box = $('[data-d="week"]');
  $('[data-title="use"]').textContent = V.title();
  const line = (name, v) => { const n = $(`[data-w="${name}"]`, box); n.parentElement.hidden = !v; n.textContent = usd(v); };
  line('list', w.list);
  line('earned', w.earned);
  line('seat', w.seat);
  $('[data-w="g"]', box).textContent = plainFig(w.g, 'g');
  $('[data-w="grids"]', box).textContent = `${V.grids('catalog.video_hour')}, location-based`;
  for (const place of ['home', 'cloud']) {
    $(`[data-w="${place}"]`, box).textContent = w.noWater ? 'no figure for one feed' : plainFig(w.water[place], 'ml');
    $(`[data-w="${place}-tag"]`, box).textContent = V.basin(place);
  }
}
function refresh(reason) {
  if (reason === 'settings') V.set(S);
  const line = V.line();
  $$('[data-setting-line]').forEach((n) => { n.textContent = line; });
  $$('[data-setting-list]').forEach((n) => n.replaceChildren(...Object.keys(D.sel).map((name) => el('li', '', `${D.names[name]}: ${D.sel[name].say[S.settings[name]]}`))));
  $$('[data-if]').forEach((n) => { const [k, v] = n.dataset.if.split(':'); n.hidden = String(V.p[k]) !== v; });
  $$('[data-reading]').forEach((n) => { n.textContent = V.reading(n.dataset.reading); });
  $$('[data-group]').forEach((n) => { const [k, v] = n.dataset.group.split(':'); n.hidden = S.opts[k] !== v; });
  for (const [key, n] of rowNodes) if (D.rows[key]) $('.ladder-label', n).textContent = V.label(key);
  for (const name of Object.keys(painters)) {
    const order = painters[name]();
    shown[name] = order.filter((key) => !rowNodes.get(key).hidden);
    if (name === 'where') S.sel.where = `where.${S.opts.workload}.${S.sel.where.split('.').pop()}`;
    if (!shown[name].includes(S.sel[name])) [S.sel[name]] = shown[name];
    selectRow(name, S.sel[name], true);
  }
  $$('[data-measure-of]').forEach((n) => { n.textContent = D.words.measure[S.m]; });
  paintWeek();
  paintTables();
  syncControls();
  writeQuery();
}
function syncControls() {
  $$('input[data-setting]').forEach((n) => { n.checked = S.settings[n.dataset.setting] === n.value; });
  $$('input[data-opt]').forEach((n) => { n.checked = (n.dataset.opt === 'm' ? S.m : n.dataset.opt === 'mode' ? S.mode : S.opts[n.dataset.opt]) === n.value; });
  $$('input[data-field]').forEach((n) => { if (document.activeElement !== n) n.value = n.dataset.field === 'seats' ? S.seats : S.fields[n.dataset.field]; });
  $$('[data-office]').forEach((n) => { n.hidden = S.mode !== 'office'; });
}
const fieldDefault = (k) => (k === 'gb' && S.mode === 'office' ? D.inputs.seat_gb[0] : D.fields[k]);
function writeQuery() {
  const q = new URLSearchParams();
  const fresh = V.fresh();
  for (const group_ of ['settings', 'opts', 'sel']) for (const [k, v] of Object.entries(S[group_])) if (v !== fresh[group_][k]) q.set(group_ === 'sel' ? `row_${k}` : k, v);
  for (const [k, v] of Object.entries(S.fields)) if (v !== fieldDefault(k)) q.set(`f_${k}`, v);
  if (S.m !== 'wh') q.set('m', S.m);
  if (S.mode !== 'person') { q.set('mode', S.mode); q.set('seats', S.seats); }
  const text = q.toString();
  history.replaceState(null, '', `${text ? `?${text}` : location.pathname}${location.hash}`);
}
function readQuery() {
  const q = new URLSearchParams(location.search);
  for (const k of Object.keys(S.settings)) if (D.sel[k].opts[q.get(k)]) S.settings[k] = q.get(k);
  for (const [k, stops] of Object.entries(D.stops)) if (stops.includes(q.get(k))) S.opts[k] = q.get(k);
  if (MS.includes(q.get('m'))) S.m = q.get('m');
  if (q.get('mode') === 'office') { S.mode = 'office'; S.fields.gb = fieldDefault('gb'); if (+q.get('seats') > 0) S.seats = +q.get('seats'); }
  for (const k of Object.keys(S.fields)) { const v = q.get(`f_${k}`); if (v !== null && v !== '' && +v >= 0) S.fields[k] = +v; }
  for (const k of Object.keys(S.sel)) if (rowNodes.has(q.get(`row_${k}`))) S.sel[k] = q.get(`row_${k}`);
}
function selfCheck() {
  const run = new Run(D, null);
  const fails = [];
  let n = 0;
  for (const [key, want] of Object.entries(D.check)) {
    const row = V.at(run.tree, key);
    MS.forEach((m, i) => {
      if (blank(want[i])) return;
      n += 1;
      if (blank(row?.[m]) || Math.abs(row[m] - want[i]) > 0.005 * Math.abs(want[i])) fails.push(`${key} ${m}`);
    });
  }
  $$('[data-check]').forEach((box) => {
    box.hidden = false;
    box.classList.toggle('is-warn', fails.length > 0);
    box.textContent = fails.length ? `Warning: this page does not match the model at ${fails.slice(0, 3).join(', ')}${fails.length > 3 ? `, and ${fails.length - 3} more` : ''}. Do not rely on these figures.` : `Builder matches the model: ${grouped(n)} figures within 0.5 percent of the published file.`;
  });
}
// The drawer starts under the disclaimer band, so the plate compresses beside it and nothing the reader is watching is covered.
const placeDrawer = () => document.documentElement.style.setProperty('--drawer-top', `${Math.max(0, $('.x-band').getBoundingClientRect().bottom)}px`);
function openDrawer(from) {
  const drawer = $('#settings');
  drawer.from = from;
  drawer.hidden = false;
  document.documentElement.classList.add('has-drawer');
  placeDrawer();
  drawer.focus();
}
function closeDrawer() {
  const drawer = $('#settings');
  if (drawer.hidden) return;
  drawer.hidden = true;
  document.documentElement.classList.remove('has-drawer');
  drawer.from?.focus();
}
function project() {
  const box = $('[data-plate-x="project"]');
  const read = (k) => { const n = $(`[data-pf="${k}"]`, box); return n.value === '' || !(+n.value >= 0) ? null : +n.value; };
  const [mw, lf, wue, grid, load] = ['mw', 'lf', 'wue', 'grid', 'load'].map(read);
  const mwh = blank(mw) || blank(lf) ? null : mw * lf * HOURS;
  const empty = '–';
  const big = (v, unit) => (blank(v) ? empty : `${grouped(Number(v.toPrecision(3)))} ${unit}`);
  const out = { mwh: big(mwh, 'MWh'), water: big(blank(mwh) || blank(wue) ? null : mwh * 1000 * wue, 'liters'), co2: big(blank(mwh) || blank(grid) ? null : mwh * grid / 1000, 'tonnes CO2e'), share: blank(mwh) || !load ? empty : `${num(mwh / load * 100)} percent` };
  for (const [k, v] of Object.entries(out)) $(`[data-po="${k}"]`, box).textContent = v;
  $('[data-project-hint]', box).hidden = !blank(mwh);
}
function outputsCsv() {
  const rows = [['row', 'measure', 'value', 'low', 'high', 'price_basis', 'settings']];
  const setting = Object.entries(S.settings).map(([k, v]) => `${k}=${v}`).join(' ');
  for (const key of Object.keys(D.check)) {
    const r = V.at(V.t, key);
    for (const m of ['wh', 'usd', 'g']) { const [lo, hi] = V.spread(key, m); rows.push([key, m, r[m], lo, hi, m === 'usd' ? V.basis(key) : '', setting]); }
    for (const part of V.water(key)) rows.push([key, `ml ${part.place}`, part.v, part.lo, part.hi, '', setting]);
  }
  return rows.map((r) => r.map((c) => (blank(c) ? '' : c)).join(',')).join('\n');
}
function setView(plate, name) {
  plate.dataset.view = name;
  $$('.plate-view', plate).forEach((n) => { n.hidden = n.dataset.view !== name; });
  $$('.plate-views input', plate).forEach((n) => { n.checked = n.value === name; });
}
async function copyReading(plate) {
  const reading = $('[data-d="reading"]', plate);
  const status = $('.plate-status', plate);
  const titles = $$('[data-d="note"] .receipt', plate).map((chip) => $('.plate-source-title', document.getElementById(chip.getAttribute('href').slice(1))).textContent);
  try {
    await navigator.clipboard.writeText(`${reading.textContent}\n${location.href}${titles.length ? `\nSources: ${[...new Set(titles)].join('; ')}` : ''}`);
    status.textContent = 'Copied with its link and sources.';
  } catch {
    getSelection().selectAllChildren(reading);
    status.textContent = 'Copy is blocked here. The Reading is selected: press Ctrl+C.';
  }
}
function openReceipt(chip) {
  const plate = chip.closest('.x-plate');
  const box = $('[data-d="receipt"]', plate);
  const id = chip.getAttribute('href').slice(1);
  const closing = box.dataset.open === id && !box.hidden;
  box.hidden = closing;
  box.dataset.open = id;
  box.replaceChildren(...(closing ? [] : [...document.getElementById(id).cloneNode(true).children]));
  $$('.receipt', plate).forEach((c) => c.setAttribute('aria-expanded', !closing && c === chip));
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.setting) { S.settings[t.dataset.setting] = t.value; refresh('settings'); }
  else if (t.dataset.opt === 'm') { S.m = t.value; refresh(); }
  else if (t.dataset.opt === 'mode') {
    const was = fieldDefault('gb');
    S.mode = t.value;
    if (S.fields.gb === was) S.fields.gb = fieldDefault('gb');
    refresh();
  } else if (t.dataset.opt) { S.opts[t.dataset.opt] = t.value; refresh(); }
  else if (t.dataset.field) {
    const seat = t.dataset.field === 'seats';
    const bad = t.value === '' || !(+t.value >= (seat ? 1 : 0));
    t.setAttribute('aria-invalid', bad);
    $('[data-why]').textContent = bad ? `Enter a number${seat ? ' of one or more' : ' zero or above'}. The Wall keeps the last good value.` : t.dataset.whyText;
    if (!bad) { if (seat) S.seats = +t.value; else S.fields[t.dataset.field] = +t.value; refresh(); }
  } else if (t.dataset.pf) project();
}
function onClick(e) {
  const t = e.target;
  const hit = (selector) => t.closest?.(selector);
  if (hit('[data-open-settings]')) { e.preventDefault(); openDrawer(hit('[data-open-settings]')); }
  else if (hit('[data-close-settings]')) closeDrawer();
  else if (hit('.x-plate .receipt, .x-plate a.x-c') && $('[data-d="receipt"]', hit('.x-plate'))) { e.preventDefault(); openReceipt(hit('.x-plate .receipt, .x-plate a.x-c')); }
  else if (hit('.plate-plot [data-row]')) { const plate = hit('.x-plate'); setView(plate, 'reading'); selectRow(plate.dataset.plateX, hit('[data-row]').dataset.row); }
  else if (hit('[data-copy]')) copyReading(hit('.x-plate'));
  else if (hit('[data-reset]')) { Object.assign(S, V.fresh()); refresh('settings'); }
  else if (hit('[data-preset]')) { $(`[data-pf="${t.dataset.for}"]`).value = t.dataset.preset; project(); }
  else if (hit('[data-outputs]')) { const a = el('a'); a.href = URL.createObjectURL(new Blob([outputsCsv()], { type: 'text/csv' })); a.download = 'resource-model-outputs.csv'; a.click(); }
}
function wirePlot(plot) {
  const plate = plot.closest('.x-plate');
  const name = plate.dataset.plateX;
  plot.tabIndex = 0;
  plot.setAttribute('role', 'listbox');
  $$('ol, .wall-group', plot).forEach((n) => n.setAttribute('role', 'none'));
  on(plot, 'keydown', (e) => {
    const keys = shown[name];
    const i = keys.indexOf(S.sel[name]);
    const n = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1, Enter: i, ' ': i }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    setView(plate, 'reading');
    selectRow(name, keys[Math.max(0, Math.min(n, keys.length - 1))]);
  });
  on(plot, 'pointerover', (e) => { const row = e.target.closest('[data-row]'); if (row) detail(name, row.dataset.row); });
  on(plot, 'pointerleave', () => detail(name, S.sel[name]));
}
function fit() {
  if (innerWidth >= 1100) document.documentElement.style.setProperty('--plate-h', `${Math.round(Math.max(544, innerHeight - $('.x-band').getBoundingClientRect().bottom - scrollY - 24))}px`);
}

for (const n of $$('[data-js]')) n.hidden = false;
// The parts a default row does not show are made here, and each board's group heads, so the page without scripts carries no empty marks.
for (const n of $$('.wall-row')) {
  const track = $('.wall-track', n);
  for (const cls of [...TAGS.map((tag) => `w w-${tag}`), 'wall-range', 'wall-needle']) if (!$(`.${cls.split(' ').pop()}`, track)) { const part = el('i', cls); part.hidden = true; track.append(part); }
}
for (const n of $$('[data-board^="cross."] .ladder-row')) {
  if (!$('.x-or-never', n)) { const word = el('i', 'x-or-never', D.words.orNever); word.setAttribute('aria-hidden', 'true'); $('.ladder-track', n).append(word); }
}
for (const [id, spec] of Object.entries(D.boards)) {
  if (spec.kind !== 'wall' && spec.kind !== 'ruler') continue;
  const rows = $('ol', $(`[data-board="${id}"]`));
  const head = (text) => { const li = el('li', 'wall-group', text); li.hidden = true; rows.prepend(li); return li; };
  for (const [basis, text] of Object.entries(D.words.heads)) head(text).dataset.basis = basis;
  if (spec.scenario) head('Scenario: a declared feed, not the default').dataset.scenario = '';
}
document.documentElement.classList.add('x-live');
$('#settings').hidden = true;
$$('.x-plate.plate-fit').forEach((n) => n.classList.add('is-live'));
$$('.x-plate.plate-fit .plate-detail').forEach((n) => { n.tabIndex = 0; n.setAttribute('role', 'group'); n.setAttribute('aria-label', 'Detail'); }); // it scrolls on its own
$$('.x-plate').forEach((plate) => { if ($('.plate-views', plate)) setView(plate, 'reading'); });
$$('[data-d="tokens"]').forEach((slot) => slot.append(...$('#x-tokens').cloneNode(true).children));
readQuery();
on(document, 'input', onInput);
on(document, 'focusin', (e) => { if (e.target.dataset?.whyText) $('[data-why]').textContent = e.target.dataset.whyText; });
on(document, 'change', (e) => {
  if (e.target.dataset.field) { e.target.removeAttribute('aria-invalid'); syncControls(); }
  if (e.target.closest?.('.plate-views')) setView(e.target.closest('.x-plate'), e.target.value);
});
on(document, 'click', onClick);
on(document, 'keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = $('[data-d="receipt"]:not([hidden])');
  if (!$('#settings').hidden) closeDrawer();
  else if (open) { open.hidden = true; open.replaceChildren(); }
});
$$('.x-plot').forEach(wirePlot);
let opened = [];
on(window, 'beforeprint', () => { opened = $$('details:not([open])'); opened.forEach((n) => { n.open = true; }); });
on(window, 'afterprint', () => opened.forEach((n) => { n.open = false; }));
on(window, 'resize', () => { fit(); placeDrawer(); });
on(window, 'scroll', () => { if (!$('#settings').hidden) placeDrawer(); });
document.fonts?.ready.then(fit);
fit();
refresh('settings');
selfCheck();
project();
if (location.hash === '#settings') openDrawer($('[data-open-settings]'));
}());
