// Resource Use Explorer: the model's formulas, ported from scripts/resource_model.py, which stays canonical (scripts/page_checks/explorer.js holds this file to Python's numbers),
// and the words the page prints for them. Pure: no page, no fetch, no coefficient of its own. Node loads it for the build and the checks; the page reads window.resourceModel.
(function () {
'use strict';
const HOURS = 8760;
const B2_PERIODS = HOURS / 720; // B2 lists dollars per TB per 30 days, and the model's year is 8,760 hours: 365/30 of those periods, as Python
const WEEK = 168; // hours in the week Your Use counts
const blank = (v) => v === undefined || v === null;

// ---------------------------------------------------------------- the equations
const idleMult = (u, a) => (a / u + 1 - a) / (1 + a);
const wGenNw = (share, convention, gas) => share * convention + (1 - share) * gas;
const tokensUsd = (tIn, tOut, tCache, pIn, pOut, pCache = 0) => (tIn * pIn + tCache * pCache + tOut * pOut) / 1e6;
const tokensWh = (tIn, tOut, tCache, p) => (tIn * p.ei_in + tCache * p.ei_in * p.cache_share + tOut * p.ei_out) / 1000 * p.pue_hyper;
const selfRun = (hardware, kwh, tariff, hours, wage, support = 0) => hardware + kwh * tariff + hours * wage + support;
// As project_scale in Python. A blank in leaves its outputs blank.
function projectScale(mw, lf, wue, grid, load) {
  const mwh = blank(mw) || blank(lf) ? null : mw * lf * HOURS;
  return { mwh, water: blank(mwh) || blank(wue) ? null : mwh * 1000 * wue, co2: blank(mwh) || blank(grid) ? null : mwh * grid / 1000, share: blank(mwh) || !load ? null : mwh / load };
}
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

// n local nodes each holding tbEach for a year: whole boxes, or drives only when the nodes are already on. Returns Wh at the nodes and dollars.
function storeYear(p, n, tbEach, hours, netWh = 0) {
  const on = p.already_on;
  const wh = n * (on ? tbEach * p.stor_wh_tb_h * HOURS * p.pue_room : p.nas_w * HOURS * p.pue_room);
  const hardware = n * (tbEach * p.hdd_usd_tb + (on ? 0 : p.nas_chassis_usd)) / p.life;
  return [wh, selfRun(hardware, (wh + netWh) / 1000, p.tariff, hours, p.wage)];
}

function data(p, c, L) {
  const n = p.nations;
  const tb = p.shared_tb;
  const total = tb * 1000;
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
    const [wh, price] = storeYear(p, n, each, hours, netWh);
    return four([L.room(wh), L.net(netWh)], price);
  };
  const fedTb = p.fed_tb * p.fed_copies;
  return {
    ten_copies: local(p.nas_raw_tb, n * admin, pullWh),
    central_s3: four([L.dc(centralWh)], s3),
    central_s3_with_pulls: four([L.dc(centralWh), L.net(pullWh)], s3 + egress),
    central_r2: four([L.dc(centralWh)], total * p.p_r2 * 12 + centralAdmin),
    central_b2: four([L.dc(centralWh)], tb * p.p_b2_tb * B2_PERIODS + centralAdmin),
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

// One Nation leaves a cloud store, once, for its own node or a federated set of Nations' nodes. A move row is one time and a year row is one year; nothing here adds the two.
function leaving(p, L) {
  const iNet = netIntensity({ ...p, connection: 'wifi' }); // a Nation's move runs on its fixed link, whatever the reader's own connection is
  const tb = p.exit_tb;
  const gb = tb * 1000;
  const raw = tb * p.nas_raw_tb / p.shared_tb;
  const box = raw * p.hdd_usd_tb + (p.already_on ? 0 : p.nas_chassis_usd);
  const cloudWh = tb * p.replicas * p.stor_wh_tb_h * HOURS * p.pue_hyper;
  const admin = p.central_admin_h_month * 12 * p.wage;
  const stay = { s3: gb * p.p_s3 * 12 + admin, r2: gb * p.p_r2 * 12 + admin, b2: tb * p.p_b2_tb * B2_PERIODS + admin };
  const rate = { s3: p.p_egress, r2: p.p_r2_egress, b2: p.p_b2_egress };
  const nodeCopies = p.exit_node_copies;
  const fedCopies = p.replicas; // the cloud row's replica count: an assumption about how many copies, not about durability, which nothing here models
  const [nodeWh, nodeUsd] = storeYear(p, nodeCopies, raw, nodeCopies * p.nas_admin_h_month * 12);
  const [fedWh, fedUsd] = storeYear(p, fedCopies, raw, fedCopies * p.fed_admin_h_month * 12);
  const out = {};
  for (const [s, price] of Object.entries(stay)) out[`year_${s}`] = four([L.dc(cloudWh)], price);
  out.year_cloud_same_grid = four([layer(cloudWh, p.grid_local, p.wue_site, genWater(p, p.gen_local), 'local', 'dc', 'local')], stay.s3);
  out.year_node = four([L.room(nodeWh)], nodeUsd);
  out.year_federated = four([L.room(fedWh)], fedUsd);
  const payback = {};
  // the node takes one copy over the wire; the federated set takes every copy over the wire, and only the billed pulls pay egress
  for (const [dest, wire, pulls, yearUsd] of [['node', 1, 1, nodeUsd], ['federated', fedCopies, p.exit_fed_pulls, fedUsd]]) {
    for (const s of Object.keys(stay)) {
      const egress = pulls * gb * rate[s];
      const labor = wire * p.exit_admin_h * p.wage;
      const row = Object.assign(four([L.net(wire * gb * iNet)], egress + labor + p.exit_other_usd), { egress_usd: egress, labor_usd: labor, other_bill_usd: p.exit_other_usd });
      out[`move_${s}_${dest}`] = row;
      payback[`${dest}_vs_${s}`] = positive(row.usd, stay[s] - yearUsd);
    }
  }
  const embodied = p.emb_hdd_kg_tb / p.life * 1000;
  const perTb = p.replicas * p.stor_wh_tb_h * HOURS * p.pue_hyper;
  // the size where a year on whole boxes meets the cloud's drives-only figure, which grows with the data while one box per copy does not; drives only, both grow, so no size ties
  const wholeBoxes = (copies) => (p.already_on ? null : copies * p.nas_w * HOURS * p.pue_room / perTb);
  out.payback = payback;
  out.readings = {
    egress_per_pull_usd: { s3: gb * rate.s3, r2: gb * rate.r2, b2: gb * rate.b2 },
    copies: { node: nodeCopies, federated: fedCopies },
    transfer_days_one_copy: tb * 8e6 / p.exit_link_mbps / 86400,
    hardware_usd: { node: nodeCopies * box, federated: fedCopies * box },
    embodied_own_node_g: nodeCopies * raw * embodied,
    embodied_federated_set_g: fedCopies * raw * embodied,
    embodied_cloud_replicas_g: tb * p.replicas * embodied,
    node_w_at_energy_tie: cloudWh / (nodeCopies * HOURS * p.pue_room),
    tb_at_energy_tie: { node: wholeBoxes(nodeCopies), federated: wholeBoxes(fedCopies) },
    cloud_service_boundary_g: tb * p.whole_service_kg_tb * 1000, // a reading on another boundary, one agency's four data centers, printed beside the drives-only floor and never as the row or as a bound
  };
  return out;
}

// What each architecture row asks of the Nation that runs it: the idle watts it carries all year and the paid hours it counts. A vendor's idle sits inside the vendor's own figure. These lines score nothing.
function upkeep(p) {
  const off = 1 - p.already_on;
  const n = p.nations;
  const held = (tb) => (p.already_on ? p.stor_wh_tb_h * tb : p.nas_w);
  const raw = p.exit_tb * p.nas_raw_tb / p.shared_tb;
  const nodeCopies = p.exit_node_copies;
  const fedCopies = p.replicas;
  const each = (names, row) => Object.fromEntries(names.map((name) => [name, row]));
  const none = [0, 0];
  const localA = [p.office_w, p.office_admin_h_month * 12];
  const central = [0, p.central_admin_h_month * 12];
  const stores = ['s3', 'r2', 'b2'];
  const table = {
    A: { ...each(['cloud', 'cloud_with_sync', 'cloud_same_grid'], [0, p.cloud_admin_h_month * 12]), local: localA, local_hydro: localA, local_two_boxes: [2 * localA[0], localA[1]] },
    B: { platform: none, cache: none, ...each(p.views.map((v) => `local_${v}`), [off * p.mini_w, p.mini_admin_h_month * 12]) },
    C: {
      ten_copies: [n * held(p.nas_raw_tb), n * p.nas_admin_h_month * 12], ...each(['central_s3', 'central_s3_with_pulls', 'central_r2', 'central_b2'], central),
      federated: [n * held(p.fed_tb * p.fed_copies), n * p.fed_admin_h_month * 12], federated_replicas: [n * held(p.fed_tb * p.replicas), n * p.fed_admin_h_month * 12],
    },
    D: {
      ...each(['hyper', 'hyper_same_grid', 'colo', 'laptop', 'laptop_with_fallback', 'phone', 'phone_wall', 'phone_wall_fallback'], none),
      ...each(['node_100k', 'node_1m'].flatMap((name) => ['', '_hydro', '_fallback'].map((end) => name + end)), [off * p.node_w, p.node_admin_h_year]),
    },
    E: {
      ...each(['year_s3', 'year_r2', 'year_b2', 'year_cloud_same_grid'], central), year_node: [nodeCopies * held(raw), nodeCopies * p.nas_admin_h_month * 12], year_federated: [fedCopies * held(raw), fedCopies * p.fed_admin_h_month * 12],
      ...each(stores.map((s) => `move_${s}_node`), [0, p.exit_admin_h]), ...each(stores.map((s) => `move_${s}_federated`), [0, fedCopies * p.exit_admin_h]),
    },
  };
  return Object.fromEntries(Object.entries(table).map(([letter, rows]) => [letter, Object.fromEntries(Object.entries(rows).map(([k, [idle_w, admin_h]]) => [k, { idle_w, admin_h }]))]));
}

// What a field reading would change, worked from the current inputs. The page's sentences read these, so they cannot drift from the model.
function wattsFor(times, rowWh, watts, perW) {
  if (!perW) return null;
  const w = (times * rowWh - (rowWh - watts * perW)) / perW;
  return w > 0 ? w : null;
}
function fieldLines(p, cat, arch) {
  const off = 1 - p.already_on;
  const room = HOURS * p.pue_room;
  const rows = {
    office_server: [arch.A.local, 'office_w', room], nas_ten_nations: [arch.C.federated, 'nas_w', off * p.nations * room], nas_own_node: [arch.E.year_node, 'nas_w', off * p.exit_node_copies * room],
    node_100k: [arch.D.node_100k, 'node_w', off * room * p.prompts_block / p.node_prompts_100k], node_1m: [arch.D.node_1m, 'node_w', off * room * p.prompts_block / p.node_prompts_1m],
  };
  for (const v of p.views) rows[`media_box_${v}`] = [arch.B[`local_${v}`], 'mini_w', off * room * p.views_block / v];
  const idle = {};
  for (const [name, [row, key, perW]] of Object.entries(rows)) idle[name] = { default_w: p[key], idle_share: row.wh ? p[key] * perW / row.wh : null, halves_at_w: wattsFor(0.5, row.wh, p[key], perW), doubles_at_w: wattsFor(2, row.wh, p[key], perW) };
  const top = { ...p, cache_share: p.cache_share_top };
  const median = [p.coding_fresh, p.coding_out, p.coding_cached];
  const mean = [p.coding_fresh_mean, p.coding_out_mean, p.coding_cached_mean];
  const hour = cat.coding_hour;
  return {
    idle,
    cache_share_top: { session_times: tokensWh(...median, top) / tokensWh(...median, p), hour_times: (hour.wh - hour.layers.data_center + p.turns_per_hour * tokensWh(...mean, top)) / hour.wh },
    coding_usd_miss_times: hour.top_down_usd / hour.usd,
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
  const arch = { A, B, C, D, E: leaving(p, L) };
  return {
    same_hour: sh, catalog: cat, hour, where: whereItRuns(p, cat), arch, cross: crossovers(p, dc),
    lever: levers(p, cat, c, B, C, D, L), upkeep: upkeep(p), field: fieldLines(p, cat, arch), use: yourUnits(p, cat, hour, L), p,
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
  constructor(D, settings, inputs, measured = {}) { // inputs: numbers the reader typed over the model's, never a setting. measured: a reader's own readings, which take no spread.
    this.D = D;
    this.base = { ...baseOf(D, settings), ...inputs, ...measured };
    this.tree = compute(this.base);
    this.swept = Object.keys(D.inputs).filter((k) => !Object.hasOwn(measured, k) && (D.inputs[k][1] !== D.inputs[k][0] || D.inputs[k][2] !== D.inputs[k][0]));
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
  // A crossover as a range: the central count, the low and high from one change, and every change under which it never comes. A payback prints the same way, from where it stands in the tree.
  crossover(key, where = ['cross']) {
    const of = (t) => where.reduce((o, k) => o[k], t)[key];
    const value = of(this.tree);
    const hits = blank(value) ? [] : [[value, null]];
    const never = blank(value) ? [null] : [];
    const see = (t, name) => { const v = of(t); if (!blank(v)) hits.push([v, name]); else if (!blank(value)) never.push(name); };
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

// ---------------------------------------------------------------- the custody setting, a reader's own reading, and the carbon damage layer, as custody_view, apply_measured, and damage_column in Python
const span = (values) => { const found = values.filter((v) => !blank(v)); return found.length ? [Math.min(...found), Math.max(...found)] : null; };
// What one rule keeps and what leaves, and what it costs in idle watts, paid hours, price, and energy. A row that breaches the rule leaves whole, with its reason: nothing is scored lower, and no number here stands for consent or custody.
function custodyView(D, tree, rule) {
  const spec = D.custody;
  const allowed = spec.options[rule].allows;
  const out = { rule, label: spec.options[rule].label, fixed_line: spec.fixed_line, comparisons: {} };
  for (const letter of Object.keys(tree.arch)) {
    const kept = [];
    const left = [];
    const costed = { kept: [], left: [] };
    const oneTime = [];
    for (const key of D.boards[`arch.${letter}`].rows) {
      const row = spec.rows[key];
      const stays = allowed.includes(row.holder);
      if (stays) kept.push(row.note ? { key, note: row.note } : { key });
      else left.push({ key, reason: row.reason || spec.reasons[row.holder] });
      if (row.cost === 'one_time') { if (stays) oneTime.push(key); } else if (row.cost !== 'skip') costed[stays ? 'kept' : 'left'].push(key);
    }
    const name = (key) => key.split('.').pop();
    const view = { kept, left, cost: null };
    if (left.length) {
      const sides = (read) => ({ kept: span(costed.kept.map(read)), left: span(costed.left.map(read)) });
      const lines = {
        idle_w: sides((key) => tree.upkeep[letter][name(key)].idle_w), admin_h: sides((key) => tree.upkeep[letter][name(key)].admin_h),
        usd: sides((key) => tree.arch[letter][name(key)].usd), wh: sides((key) => tree.arch[letter][name(key)].wh),
      };
      lines.usd.bases = { kept: [...new Set(costed.kept.map((key) => D.rows[key].pb))].sort(), left: [...new Set(costed.left.map((key) => D.rows[key].pb))].sort() };
      const both = Object.entries(lines).filter(([, l]) => l.kept && l.left);
      view.cost = { lines, kept_higher_on: both.filter(([, l]) => l.kept[0] > l.left[0]).map(([f]) => f), kept_lower_on: both.filter(([, l]) => l.kept[0] < l.left[0]).map(([f]) => f) };
    }
    if (oneTime.length) {
      view.one_time = { usd: span(oneTime.map((key) => tree.arch[letter][name(key)].usd)), wh: span(oneTime.map((key) => tree.arch[letter][name(key)].wh)), admin_h: span(oneTime.map((key) => tree.upkeep[letter][name(key)].admin_h)) };
    }
    out.comparisons[letter] = view;
  }
  return out;
}

// %g, as Python prints a typed value in the measured line: six significant figures, and a value exactly halfway rounds to the even figure, as Python's does,
// where toPrecision alone would round it up (12345.25 prints 12345.2 on both). toExponential(30) shows the binary value's own digits, so a true half is seen as one.
function shortest(x) {
  if (!x) return '0';
  const exact = Math.abs(x).toExponential(30);
  const cut = exact.indexOf('e');
  const half = exact[7] === '5' && !/[1-9]/.test(exact.slice(8, cut)) && +exact[6] % 2 === 0;
  const rounded = half ? Number(`${x < 0 ? '-' : ''}${exact.slice(0, 7)}${exact.slice(cut)}`) : +x.toPrecision(6);
  const e = Math.floor(Math.log10(Math.abs(rounded)));
  if (e >= -4 && e < 6) return String(rounded);
  const [mantissa, power] = rounded.toExponential(5).split('e');
  return `${mantissa.replace(/\.?0+$/, '')}e${power[0]}${power.slice(1).padStart(2, '0')}`;
}
const NUMBER_TEXT = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;
// A typed value stands in for an input in this run and nowhere else. The label comes from the model, never from what a reader or a file supplies. A bad value is refused with what is allowed.
function applyMeasured(D, typed) {
  const spec = D.measured.inputs;
  const values = {};
  const records = [];
  for (const [key, raw] of Object.entries(typed)) {
    if (!Object.hasOwn(spec, key)) throw new Error(`${String(key).slice(0, 40)} does not take a measured value`);
    const rule = spec[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && NUMBER_TEXT.test(raw) ? Number(raw) : NaN;
    if (!(value >= rule.min && value <= rule.max)) throw new Error(`${rule.label} takes a number from ${shortest(rule.min)} to ${shortest(rule.max)} ${rule.unit}; that value was not used`);
    values[key] = value;
    records.push({ input: key, label: rule.label, value, unit: rule.unit, model_value: D.inputs[key][0], replaces_claims: [...rule.claims], note: D.measured.label });
  }
  records.sort((a, b) => (a.input < b.input ? -1 : 1));
  return { values, records };
}
const ROW_TREES = ['catalog', 'hour', 'where', 'arch', 'lever'];
// The rows a typed value reaches, from flat trees, as moved_rows in Python: every row it changed, and every row that moves when a typed input sits at its model low or high
// (the probes). So a reading equal to the model's figure, which only narrows a row's spread, still labels the rows that use it.
function movedRows(before, after, probes = []) {
  const rows = new Set();
  for (const other of [after, ...probes]) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(other)])) {
      const cut = k.lastIndexOf('.');
      if (MS.includes(k.slice(cut + 1)) && ROW_TREES.includes(k.split('.')[0]) && before[k] !== other[k]) rows.add(k.slice(0, cut));
    }
  }
  return [...rows].sort();
}
// What the reader's readings reach at these settings: the rows above, and Your Use and the crossovers, which are rows on this page though the model's CSV does not hold them.
// base is the run without the readings; after is the tree with them.
function readingReach(D, base, after, measured) {
  const before = compute(base);
  const probes = Object.keys(measured).flatMap((k) => [1, 2].map((i) => compute({ ...base, [k]: D.inputs[k][i] })));
  const reach = new Set(movedRows(flatten(before), flatten(after), probes.map((t) => flatten(t))));
  for (const t of [after, ...probes]) {
    for (const k of Object.keys(before.use)) if (MS.some((m) => before.use[k][m] !== t.use[k][m])) reach.add(`use.${k}`);
    for (const k of Object.keys(before.cross)) if (before.cross[k] !== t.cross[k]) reach.add(`cross.${k}`);
  }
  return reach;
}
// The one sentence that travels with any figure a typed value touched: copy, print, and CSV all use it. Unused, it names the reading without saying the figures include it.
const measuredLine = (D, records, used = true) => {
  if (!records.length) return '';
  const items = records.map((r) => `${r.label} ${shortest(r.value)} ${r.unit} (model ${shortest(r.model_value)})`).join('; ');
  return used ? `Includes ${D.measured.label}: ${items}.` : `${D.measured.label[0].toUpperCase()}${D.measured.label.slice(1)}: ${items}.`;
};

// Off by default, and the owner may yet rule it out: compute() never reads it, so no row, price, or ranking changes. One family's low, central, and high in its own currency and year; a family with no central keeps it null.
const carbonDamage = (g, family) => Object.fromEntries(['low', 'central', 'high'].map((k) => [k, blank(family[k]) ? null : g / 1e6 * family[k]]));
function damageColumn(D, g, choice = 'off') {
  if (choice === 'off') return null;
  const family = D.carbon_damage.families[choice];
  const avoidance = family.kind.startsWith('avoidance'); // an avoidance cost never wears the damage head, in the line or the table
  const column = avoidance ? D.carbon_damage.column_avoidance ?? D.carbon_damage.column : D.carbon_damage.column;
  return { column, head: avoidance ? 'Avoidance cost' : 'Damage', as_of: D.carbon_damage.as_of, family: family.label, unit: family.unit, kind: family.kind, claims: family.claims, ...carbonDamage(g, family) };
}

// A scenario file: settings and typed values on the reader's own machine. Inbound files are untrusted, so only known names and allowed values pass, the whole file is refused on any problem, and nothing in it can set a label or a sentence.
const SCENARIO_KIND = 'atni-resource-use-explorer-scenario';
const SCENARIO_WARNING = 'This file may hold your Nation\'s figures.';
const SCENARIO_MAX = 1e9; // Python's TYPED_MOST: the largest count or typed figure a field or a file takes, so no figure overflows
const SCENARIO_KEYS = ['kind', 'schema', 'notice', 'saved', 'model_hash', 'settings', 'mode', 'seats', 'fields', 'inputs', 'measured', 'custody', 'damage'];
// The largest size comparison E takes, as exit_tb_limit in Python: one four-bay box per copy at any size, so the most raw terabytes one box holds over the raw terabytes each terabyte needs.
const exitTbLimit = (D) => D.scenario.nas_box_max_raw_tb * D.scenario.shared_tb / D.inputs.nas_raw_tb[0];
// One rule for a figure a reader types, live or from a scenario file: a finite number from its floor to its ceiling. name is a typed model input, 'seats', or 'field' for a Your Use count.
const typedRange = (D, name) => [name === 'seats' ? 1 : 0, name === 'exit_tb' ? exitTbLimit(D) : SCENARIO_MAX];
const typedOk = (D, name, v) => { const [low, high] = typedRange(D, name); return typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high; };
const typedWords = (D, name) => { const [low, high] = typedRange(D, name); return `a number from ${grouped(low)} to ${grouped(high)}${name === 'exit_tb' ? ' terabytes, the most one four-bay box holds per copy' : ''}`; };
function readScenario(D, text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { problems: ['This file is not JSON, so nothing was changed. Choose a scenario file saved from this page.'] }; }
  const isSet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isSet(raw) || raw.kind !== SCENARIO_KIND || raw.schema !== 1) return { problems: ['This is not a scenario file saved from this page, so nothing was changed.'] };
  const problems = [];
  const said = (v) => String(v).slice(0, 40);
  for (const k of Object.keys(raw)) if (!SCENARIO_KEYS.includes(k)) problems.push(`Unknown entry: ${said(k)}.`);
  const section = (name) => {
    if (raw[name] === undefined) return {};
    if (isSet(raw[name])) return raw[name];
    problems.push(`${name} must be a set of names and values.`);
    return {};
  };
  const scenario = { settings: {}, fields: {}, inputs: {}, measured: {} };
  for (const [name, option] of Object.entries(section('settings'))) {
    if (!Object.hasOwn(D.sel, name)) problems.push(`Unknown setting: ${said(name)}.`);
    else if (typeof option !== 'string' || !Object.hasOwn(D.sel[name].opts, option)) problems.push(`${D.names[name] || name} has no such option.`);
    else scenario.settings[name] = option;
  }
  for (const [name, v] of Object.entries(section('fields'))) {
    if (!Object.hasOwn(D.fields, name)) problems.push(`Unknown Your Use input: ${said(name)}.`);
    else if (!typedOk(D, 'field', v)) problems.push(`The ${name} count must be ${typedWords(D, 'field')}.`);
    else scenario.fields[name] = v;
  }
  for (const [name, v] of Object.entries(section('inputs'))) {
    if (!D.typed.includes(name)) problems.push(`Unknown typed input: ${said(name)}.`);
    else if (!typedOk(D, name, v)) problems.push(`${D.names[name] || name} must be ${typedWords(D, name)}.`);
    else scenario.inputs[name] = v;
  }
  for (const [name, v] of Object.entries(section('measured'))) {
    if (typeof v !== 'number') problems.push(`${Object.hasOwn(D.measured.inputs, name) ? D.measured.inputs[name].label : said(name)} must be a plain number; a label is never read from a file.`);
    else try { Object.assign(scenario.measured, applyMeasured(D, { [name]: v }).values); } catch (error) { problems.push(`${error.message}.`); }
  }
  if (raw.mode !== undefined) { if (raw.mode === 'person' || raw.mode === 'office') scenario.mode = raw.mode; else problems.push('Who is counted must be person or office.'); }
  if (raw.seats !== undefined) { if (typedOk(D, 'seats', raw.seats)) scenario.seats = raw.seats; else problems.push(`Staff seats must be ${typedWords(D, 'seats')}.`); }
  if (raw.custody !== undefined) { if (typeof raw.custody === 'string' && Object.hasOwn(D.custody.options, raw.custody)) scenario.custody = raw.custody; else problems.push(`${D.custody.label} has no such option.`); }
  if (raw.damage !== undefined) {
    if (raw.damage === 'off' || (D.carbon_damage && typeof raw.damage === 'string' && Object.hasOwn(D.carbon_damage.families, raw.damage))) scenario.damage = raw.damage;
    else problems.push('The illustrative damage control has no such option.');
  }
  return { problems, scenario, otherBuild: raw.model_hash !== D.hash };
}

// ---------------------------------------------------------------- figures in words
const grouped = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(v);
const unfit = (v) => typeof v === 'number' && !Number.isFinite(v); // NaN or an infinity: it says so in words, never as 0 or $0
// Two significant figures, three at 100 and above; d overrides. No trailing zero, here or on the plates: 3, not 3.0.
function num(v, d) {
  if (unfit(v)) return 'no figure';
  const a = Math.abs(v);
  if (!a) return '0';
  if (a >= 99.5) return grouped(Number(v.toPrecision(d || 3)));
  return String(+v.toPrecision(d || 2));
}
const cents = (s) => (+s && s.length < 4 ? (+s).toFixed(2) : s); // money keeps its cents below a dollar: $0.20, $0.04, $0.004
const usd = (v) => (unfit(v) ? 'no figure' : Math.abs(v) >= 100 ? `$${grouped(Number(v.toPrecision(3)))}` : Math.abs(v) >= 1 ? `$${v.toFixed(2)}` : `$${cents(num(v))}`);
const SCALE = { wh: [[1e7, 1e6, 'MWh'], [1e4, 1e3, 'kWh'], [0, 1, 'Wh']], g: [[1e7, 1e6, 't CO2e'], [1e4, 1e3, 'kg CO2e'], [0, 1, 'g CO2e']], ml: [[1e3, 1e3, 'L'], [0, 1, 'mL']] };
const scaleOf = (v, m) => SCALE[m].find(([from]) => Math.abs(v) >= from);
function figure(v, lo, hi, m, at) { // num, unit, and the spread as a tag: the one form every value and table cell reads
  if (blank(v)) return { num: 'no price', unit: '', tag: '' };
  if (unfit(v)) return { num: 'no figure', unit: '', tag: '' };
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
    settings: Object.fromEntries(Object.entries(D.sel).map(([k, s]) => [k, s.def])), fields: { ...D.fields }, inputs: {}, measured: {}, custody: D.custody.default, damage: 'off', mode: 'person', seats: D.scenario.office_users, m: 'wh',
    opts: { workload: 'prompt', comparison: 'A', crossover: 'prompts', waffle: 'iea_2025', sort: 'value', scale: 'hour' }, sel: { ...D.first },
  });
  V.set = (S) => {
    V.S = S;
    V.run = new Run(D, S.settings, S.inputs, S.measured);
    V.p = V.run.base;
    V.t = V.run.tree;
    V.records = applyMeasured(D, S.measured).records;
    V.moved = V.records.length ? readingReach(D, { ...baseOf(D, S.settings), ...S.inputs }, V.t, S.measured) : new Set(); // every row a reading reaches at these settings
  };
  V.isMoved = (key) => V.moved.has(key) || V.moved.has(`${key}.before`) || V.moved.has(`${key}.after`);
  V.measuredLine = (used = true) => measuredLine(D, V.records, used);
  V.copied = (reading, key) => (V.isMoved(key) ? `${reading} ${V.measuredLine()}` : reading); // Copy Reading: a moved row's Reading never leaves without the line
  V.keeps = (key) => !key.startsWith('arch.') || D.custody.options[V.S.custody].allows.includes(D.custody.rows[key].holder); // the custody rule removes rows; it changes no figure
  // The cloud's paid hours a month at which the office suite's two prices meet, at these settings. Null when the local suite is already the cheaper, or paid hours cost nothing.
  V.adminTie = () => {
    const { cloud, local, readings } = V.t.arch.A;
    const hours = V.p.wage > 0 ? (local.usd - (cloud.usd - readings.cloud_admin_usd)) / (12 * V.p.wage) : null;
    return hours > 0 ? hours : null;
  };
  V.adminWords = () => {
    const tie = V.adminTie();
    return tie === null ? 'At these settings the local suite is the cheaper at any number of cloud hours.' : `At these settings the two prices tie at about ${num(tie)} hours a month.`;
  };
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
    return id === 'use' ? list.filter((key) => key !== 'use.seat' || V.S.mode === 'office') : [...list, ...(m === 'g' || m === 'ml' ? spec.scenario || [] : [])].filter(V.keeps);
  };
  V.boardScale = (id, m) => (m === 'usd' ? null : scaleOf(Math.max(0, ...V.boardKeys(id, m).map((key) => Math.abs(val(key, m) || 0))), m)); // one unit down a board
  V.rowTag = (key) => (/^(catalog|hour)\./.test(key) ? D.words.price[V.basis(key)] : ''); // a Catalog row names its price basis under its label; the value cell keeps the figure and its spread
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
      const step = niceStep(reach / 4); // one ruler: the same step runs out both ways from the wall, so a left tick is never read against a right one at another pitch
      const figure = (v) => grouped(Number((v / div).toPrecision(3)));
      for (let k = 1; wall + k * step * scale < 0.97; k += 1) ticks.push({ x: wall + k * step * scale, t: figure(k * step) });
      for (let k = 1; L && wall - k * step * scale > 0.03; k += 1) ticks.push({ x: wall - k * step * scale, t: `${figure(k * step)} ${unit.split(' ')[0]}, your side`, left: true }); // the same figure can stand on both sides, so a left tick names itself
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
      reading: `${V.label(key)}: ${words(wh)}, ${blank(val(key, 'usd')) ? 'no price' : `${price.num} ${D.rows[key].pt || D.words.price[V.basis(key)]}`}, ${words({ ...g, tag: '' })}, water ${water.length ? water.map((part) => `${plainFig(part.v, 'ml')} (${basinWord(part.place)})`).join(' and ') : 'not in the record'}. Modeled, not measured.`,
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
    return `In a week ${who}with ${grouped(V.S.fields.screen)} screen hours: screen and router ${plainFig(w.screen, 'wh')}, activities ${plainFig(w.added, 'wh')}, ${largest}.`;
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
    if (name.startsWith('tb_')) return `${num(v)}${lo === hi ? '' : ` (${num(lo)} to ${num(hi)})`} TB`; // a size, with its spread, read beside the size the reader typed
    if (name.includes('tie')) return name.includes('wage') ? `$${num(v)} an hour` : `${num(v, name.startsWith('node_w') ? 3 : 2)} W`;
    if (name.includes('swing')) return `${num(v)} times`;
    if (name.includes('duplicate')) return `${num(v)} GB`;
    if (name.startsWith('copies') || name.startsWith('transfer_days')) { // a count, and days on the wire: no unit a measure's scale would pick
      const noun = name.startsWith('copies') ? (v === 1 && hi === 1 ? 'copy' : 'copies') : 'days';
      return `${num(v)}${lo === hi ? '' : ` (${num(lo)} to ${num(hi)})`} ${noun}`;
    }
    const m = name.includes('usd') ? 'usd' : /(^|_)g(_|$)/.test(name) ? 'g' : name.includes('ml') ? 'ml' : 'wh';
    return words(figure(v, lo, hi, m));
  };
  V.line = () => {
    const names = [...D.line, ...Object.keys(D.sel).filter((name) => !D.line.includes(name) && V.S.settings[name] !== D.sel[name].def)];
    const text = `${names.map(sayOf).join(', ')}.`;
    return text[0].toUpperCase() + text.slice(1);
  };
  // What a custody rule leaves out and what it costs, in words, for the block under the plate. The figures are the rows' own.
  const listed = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`);
  const COST_WORDS = { idle_w: 'idle watts', admin_h: 'paid hours', usd: 'price', wh: 'energy' };
  const COST_FIGURE = { idle_w: (x) => `${num(x)} W`, admin_h: (x) => `${num(x)} hours`, usd, wh: (x) => plainFig(x, 'wh') };
  const spanWords = (s, f) => (!s ? 'no row' : s[0] === s[1] ? f(s[0]) : `${f(s[0])} to ${f(s[1])}`);
  V.custody = (letter, rule = V.S.custody) => {
    const view = custodyView(D, V.t, rule).comparisons[letter];
    const basisWords = (bases) => bases.map((b) => D.words.price[b]).join(' and ');
    const out = {
      rule, label: D.custody.options[rule].label,
      left: view.left.map(({ key, reason }) => ({ key, label: V.label(key), reason, figures: `${plainFig(val(key, 'wh'), 'wh')}; ${blank(val(key, 'usd')) ? 'no price' : `${usd(val(key, 'usd'))}, ${D.rows[key].pt || D.words.price[V.basis(key)]}`}` })),
      notes: view.kept.filter((k) => k.note).map(({ key, note }) => ({ key, label: V.label(key), note })),
      cost: null, said: '', oneTime: '',
    };
    if (view.cost) {
      const { lines, kept_higher_on: higher, kept_lower_on: lower } = view.cost;
      out.cost = Object.entries(lines).map(([f, l]) => {
        const basis = f === 'usd' ? [basisWords(l.bases.kept), basisWords(l.bases.left)] : ['', ''];
        return { label: D.custody.cost_labels[f], kept: [spanWords(l.kept, COST_FIGURE[f]), basis[0]].filter(Boolean).join(', '), left: [spanWords(l.left, COST_FIGURE[f]), basis[1]].filter(Boolean).join(', ') };
      });
      const parts = [higher.length && `higher on ${listed(higher.map((f) => COST_WORDS[f]))}`, lower.length && `lower on ${listed(lower.map((f) => COST_WORDS[f]))}`].filter(Boolean);
      out.said = parts.length ? `Lowest figure against lowest figure, the rows that stay run ${parts.join(', and ')}. A vendor's figure may count fewer items than a node's; the plate's boundary note says what each row counts.` : '';
    }
    if (view.one_time) out.oneTime = `The move itself, one time and never added to a year: ${spanWords(view.one_time.usd, usd)}, ${spanWords(view.one_time.wh, (x) => plainFig(x, 'wh'))}, ${spanWords(view.one_time.admin_h, COST_FIGURE.admin_h)}.`;
    return out;
  };
  // A payback can be never, so it prints as a crossover does.
  V.payback = (key) => words(V.crossWords(V.run.crossover(key, ['arch', 'E', 'payback']), 'years'));
  // One holder's three paybacks in one sentence, for the selected row; the Table keeps all six.
  const PAYBACK_SUBJECT = { node: 'One copy on the Nation\'s node', federated: 'Three copies across Nations\' nodes' };
  V.paybackLine = (side) => {
    const say = (store) => { const k = `${side}_vs_${store}`; return blank(V.run.crossover(k, ['arch', 'E', 'payback']).value) ? 'never at these settings' : `in ${V.payback(k)}`; };
    return `${PAYBACK_SUBJECT[side]} pays back against S3 ${say('s3')}; against R2 ${say('r2')}; against B2 ${say('b2')}. Each range is one change at a time.`;
  };
  // The illustrative damage of one row, or null with the control off. Its own column, in the family's own currency and year; never a sum with a price.
  V.damageOf = (g) => (V.S.damage === 'off' ? null : damageColumn(D, g, V.S.damage));
  V.damage = (key) => V.damageOf(val(key, 'g'));
  V.damageCurrency = (c) => c.unit.split(' per ')[0];
  V.damageFig = (c) => { // central first, low and high beside it, never one number alone
    const sym = V.damageCurrency(c).endsWith('USD') ? '$' : '';
    return blank(c.central) ? `${sym}${num(c.low)} to ${num(c.high)}, no central in the source` : `${sym}${num(c.central)} (${num(c.low)} to ${num(c.high)})`;
  };
  V.damageWords = (c, what = 'this row\'s CO2e') => `${c.family}, ${c.kind.startsWith('avoidance') ? 'an avoidance cost' : 'an estimate'}: ${V.damageFig(c)}, ${V.damageCurrency(c)}, for ${what}`;
  V.scenarioFile = (saved) => {
    const { settings, mode, seats, fields, inputs, measured, custody, damage } = V.S;
    return { kind: SCENARIO_KIND, schema: 1, notice: SCENARIO_WARNING, saved, model_hash: D.hash, settings, mode, seats, fields, inputs, measured, custody, damage };
  };
  // Every row at the current settings. A reading's line comes first and the label sits on every row it moved; the label holds a comma, so both are quoted, as outputs_csv in Python.
  V.outputsCsv = () => {
    const setting = [...Object.entries(V.S.settings), ...Object.entries(V.S.inputs)].map(([k, v]) => `${k}=${v}`).join(' ');
    const rows = [['row', 'measure', 'value', 'low', 'high', 'price_basis', 'settings', 'measured']];
    for (const key of Object.keys(D.check)) {
      const r = at(V.t, key);
      const mark = V.moved.has(key) ? `"${D.measured.label}"` : '';
      for (const m of ['wh', 'usd', 'g']) { const [lo, hi] = V.spread(key, m); rows.push([key, m, r[m], lo, hi, m === 'usd' ? V.basis(key) : '', setting, mark]); }
      for (const part of V.water(key)) rows.push([key, `ml ${part.place}`, part.v, part.lo, part.hi, '', setting, mark]);
    }
    const line = V.measuredLine();
    return [...(line ? [`"# ${line}"`] : []), ...rows.map((r) => r.map((c) => (blank(c) ? '' : c)).join(','))].join('\n');
  };
  return V;
}

const api = {
  MS, TAGS, FEED, SCENARIO_KIND, SCENARIO_WARNING, blank, compute, baseOf, Run, flatten, Views, projectScale, num, usd, figure, words, pct, grouped, leverText, plainFig,
  custodyView, applyMeasured, movedRows, readingReach, measuredLine, carbonDamage, damageColumn, readScenario, exitTbLimit, typedRange, typedOk, typedWords,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.resourceModel = api;
}());
