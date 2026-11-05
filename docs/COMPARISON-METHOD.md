# Comparison Method: A Chat Hour Against a Video Hour (11/04/2026, revised after review)

Local working file. Model inputs and computed defaults live in `work/site-refresh/evidence/comparison-model.json`;
`work/site-refresh/tmp/compare_model.py` recomputes them and asserts that every number quoted here matches.
New claims fp-124 to fp-135 were added to `footprint.json` for the inputs the record lacked (network intensities,
device power, chat data volume, the LED comparator). Four independent reviews attacked the first draft; section 15
lists each item and what was done. The main corrections: the streaming data center figure is a per-GB serving
intensity, not an allocation of encoding and storage; medians are not multiplied by counts without a floor label;
the "near 15 Wh" tie and the Meta "order of magnitude" sentence are withdrawn; a project view reaches the decision.

## 1. The Problem and the Approach

No source measures a chat session, a streamed video, and a short-video feed on one boundary. Chat figures are
data center only (fp-001, fp-012, fp-017); video figures include the phone, the router, and the network (fp-035,
fp-041, fp-044); social figures are a phone plus a projected server share (fp-061 to fp-063). The site therefore
builds the comparison as a model: four segments per activity (data center, network, home router, device), each
filled with a sourced input or a plain assumption, each labeled measured, reported, or modeled, each shown as a
range, with the disputed inputs exposed as settings the reader changes. The two segments that depend on what the
hour is spent on (data center and network) are shown apart from the two that do not (router and device), so a
shared constant can never read as a finding. The page never prints a cross-boundary ratio as a fact.

## 2. The Model

Energy for one hour of activity r on device d, in Wh:

- `E(r) = ADDED(r) + ROUTER(r) + DEVICE(d)`, where `ADDED(r) = DC(r) + NET(r)` is what the activity adds and the
  router and device are a fixed band, identical on every row
- `DC(chat) = N x e_prompt` (N prompts in the hour; e_prompt from the text slider or the kind-of-chat setting)
- `DC(video) = GB(video) x i_dc` (i_dc 0.45 Wh per GB on measured delivery figures, 0.171 on the DESNZ follow-up, or 55 on a top-down average;
  the allocation of serving energy is unsettled, fp-149)
- `DC(short) = min(GB(short) x i_dc, 13.9)` (ceiling from Meta's 15.1 Wh per person per day over 65 minutes)
- `NET(r) = GB(r) x i_net`; `GB(chat) = N x KB_prompt / 1e6`; `GB(video)` by device; `GB(short)` 0.39
- `i_net` = fixed or mobile, average (whole network energy over traffic) or marginal (extra energy of one more stream)
- `ROUTER(r)` = 10 W x 1 h for every row (by time), or 25 Wh/GB x GB(r) (Carbon Trust convention), or 0 (BBC
  convention, and always 0 on cellular)
- `DEVICE(d)` = the device's hourly draw, the same whichever app is open

Per person per day (data center only): `chat = M x e_prompt` (a median times a mean count, so a floor; also run at
the 0.34 average-class figure); `video = minutes/60 x 1.0 GB x i_dc` (phone); `short = minutes/60 x 0.39 x i_dc`, high
case `min(minutes/60 x 13.9, 15.1)`; Meta's 15.1 Wh is printed on its own boundary and never ratioed. Heavy AI:
`prompts = Wh / e_prompt`, and streaming hours on three yardsticks, all printed: the view 1 video hour for the
reader's device, the published whole-chain hour (188; range 53.7 to 263.1), and the data center segment alone
(0.45; 0.171 at the DESNZ follow-up). Scale: `messages per day x 365 x e_prompt`, and `hours per day x 365 x 2.88 GB x i_dc`, against
IEA, LBNL, and Northwest Power and Conservation Council totals. Project: `aMW = MW x load factor`;
`TWh = aMW x 8.76 / 1000`; share of the region's 22,000 aMW; `site water = TWh x 1e9 kWh x L per kWh`. Ranges run
every input's low and high through the same equations with the settings fixed; they are not confidence intervals.

## 3. Inputs

| Input | Default | Range | Basis | Claims |
|---|---|---|---|---|
| Wh per text prompt, data center | 0.30 | 0.24 to 0.60; average-class 0.34 | measured median (Google 0.24, which reports the median because the mean is skewed by a few heavy prompts); modeled median (Joule 0.31, interquartile 0.16 to 0.60); Jegham GPT-4o short prompt 0.42; OpenAI 0.34 "average query", no method; Epoch 0.6 including a development share | fp-001, fp-017, fp-021, fp-012, fp-015 |
| Kind of chat, Wh per prompt | short text 0.30 | medium prompt 1.215; reasoning 3.91 (2.15 to 7.05); high reasoning 17.15 | modeled (Jegham preprint, which Joule says overstates production figures 4 to 20 times; Joule test-time scaling) | fp-021, fp-019, fp-025, fp-020 |
| KB of data per prompt and reply | 50 | 5 to 500 | modeled from one phone-app test (several KB; 62 KB for a web-search prompt) | fp-134 |
| Streaming data center, Wh per GB served | 0.45 | 0.171 to 55, allocation unsettled | modeled from measured hours (DIMPACT 1.3 Wh per hour over Carbon Trust's 2.88 GB hour; Carbon Trust 1 Wh). Low: the DESNZ follow-up of 07/28/2026, 0.6 Wh per viewing hour, 0.171 Wh per GB by our division. High: Sustainable Web Design's top-down 55, an upper bound and not a literal share. One operator measured 1.15. The DESNZ first report's 19.6 is retired by its authors | fp-122, fp-130, fp-037, fp-141, fp-142, sv-048, ec-024, fp-147, fp-149, fp-150 |
| Short-video data center ceiling, Wh per hour | 13.9 | 9.06 over 100 minutes | modeled bound: Meta's 15.1 Wh per daily active person per day over 65 minutes; the feed's own serving energy is GB x the intensity above, and ranking compute is unmeasured | fp-059, fp-055, fp-097 |
| Fixed network, Wh per GB, average | 1.6 | 1.6 to 6.5 | modeled (DESNZ 2024 extrapolation; Carbon Trust 2020) | fp-127, fp-124 |
| Mobile network, Wh per GB, average | 25 | 25 to 183 | modeled (DESNZ 2024; Carbon Trust 2020 100; ENGIE 2022 183) | fp-128, fp-125, fp-053 |
| Fixed and mobile, Wh per GB, marginal | 0.13 and 3.4 | point | modeled (Carbon Trust power model; ENGIE 8.6 mWh per 2.5 MB) | fp-129, fp-053 |
| Home router | 10 W; 25 Wh/GB | 5.88 to 15 W | modeled (Carbon Trust 10 W router; DIMPACT 9 to 15 W); measured 5.88 Wh per hour during 1080p phone streaming (TNO) | fp-126, fp-133, fp-049 |
| Device, Wh per hour: phone | 2.0 | 1.0 to 3.0 | measured for video (TNO 2.22; Greenspector 1.2 at 3.85 V); modeled for chat (Greenspector ChatGPT rate 1.05 to 1.36 times YouTube, set aside, worth up to about 0.7 Wh) | fp-049, fp-088, fp-086, fp-090, fp-133 |
| Device, Wh per hour: laptop | 22 | 15 to 30 | modeled (Carbon Trust Table 10; DIMPACT Table 6) | fp-132, fp-133 |
| Device, Wh per hour: television | 100 | 40 to 120 | modeled (100 W in Google, DIMPACT, DESNZ, Carbon Trust) | fp-008, fp-122, fp-143, fp-133 |
| Video GB per hour: phone, laptop, TV, mix | 1.0, 1.9, 3.0, 2.88 | 0.17 to 7 | modeled (Carbon Trust SD 1, HD 3, 4K 7, mobile 0.17 to 0.25, European mix 2.88; DESNZ 3.5) | fp-130, fp-143 |
| Short-video GB per hour | 0.39 | 0.25 to 2 | modeled (ENGIE 256 MB per day over 39.5 minutes) | fp-053 to fp-055 |
| Prompts per weekly user per day | 3.67 | 3.57 to 8 | reported mean per weekly user, counting days of non-use (OpenAI; fp-092: "not a typical person"); a per-active-day count is unpublished and higher; 8 is Jegham's high case, absent from the Reuters item it cites (fp-094, unverified) | fp-034, fp-092, fp-026, fp-094 |
| Minutes per day: YouTube, Instagram, TikTok | 88, 100, 115 | | reported (Similarweb, Android apps, 08/2026) | fp-098, fp-097, fp-096 |
| Meta electricity per daily active person | 15.1 Wh/day | | reported fleet average (all products, AI training, offices); not a bound on any one feed | fp-059, fp-060 |
| US household, Wh per day | 28,740 | | reported (EIA 2025) | fp-075 |
| Streaming hour, published whole chain | 188 | 53.7 to 263.1 | modeled (Carbon Trust 2020 Europe 188; Preist 2016 YouTube 53.7; BBC 2024 65.7; DESNZ follow-up 2026 low, medium, high 118.7, 192.3, 263.1); the ends are the sources' own extremes | fp-035, fp-120, fp-041, fp-143 |
| Heavy AI units, Wh | see section 7 | | measured (open models, no PUE) and modeled (Joule, Jegham, scaling laws, token logs) | fp-019 to fp-025, fp-031, fp-032, fp-065 to fp-070 |
| Totals: ChatGPT 2.5 billion messages per day (07/2025, consumer plans); YouTube 1 billion hours per day (2016 floor) | | | reported | fp-092, fp-050 |
| Totals: IEA 415, 485, 945 TWh (2024, 2025, 2030); LBNL 192, 649 (521 to 843) TWh (2024, 2030); Council data centers 2,020 aMW in 2030 (1,302 to 4,429); region 22,000 aMW | | | modeled (agencies) | dem-046, dem-040, dem-048, dem-028, dem-029, dem-030, dem-075, dem-058 |
| Site water, L per kWh (project view) | the applicant's | 0.27 to 1.15, consumption basis | reported (Microsoft 0.27; LBNL 0.36, rising to 0.45 to 0.48 after 2023; Google 1.15); Meta 0.19 is withdrawal and not on the same bar | tr-028, tr-009, fp-006, tr-025 |

## 4. Reader Assumptions

| Setting | Default | Options | Why it is the reader's |
|---|---|---|---|
| Prompts per hour | 10 | presets 2.52, 10, 30, 60; slider 1 to 60 | no source measures a chat hour; WildChat averages 2.52 prompts per conversation (fp-095), with no duration (fp-093); ten an hour is slow for steady chatting, so no preset is the answer |
| Kind of chat | short text, 0.30 | medium prompt 1.215; reasoning 3.91; high reasoning 17.15 | the text slider stops below GPT-5 minimal reasoning (0.67), Claude 3.7 (0.95) and o3 (1.18); a multi-turn chat carries growing context, and nobody counts model calls per chat prompt (agents make about 12, fp-031) |
| Device | phone | phone, laptop, TV | the device is most of the hour on every row |
| Connection | Wi-Fi | Wi-Fi, cellular | cellular uses the mobile intensity and has no home router |
| Network accounting | average | average, marginal | published figures differ 10 to 50 times (fp-053, fp-129); the IEA and Carbon Trust say networks draw about the same energy whatever the traffic |
| Home router | by time | by time, by data, excluded | by time charges a shared always-on device's full draw to one person's hour, by data charges an HD hour seven times the router's real draw and a chat hour nothing (fp-126), excluded follows BBC |
| Streaming data center intensity | measured delivery, 0.45 Wh/GB | measured delivery; DESNZ follow-up, 0.171 Wh/GB; top-down average, 55 Wh/GB | an unsettled allocation about 320 times wide at the extremes (fp-149). The DESNZ first report's 19.6 Wh/GB, 45 times the measured figure, was retired by its authors on 07/28/2026 after they clarified what it counted (fp-144). The top-down reading spreads all data center energy over all bytes, so it is an upper bound and not a literal share (fp-150) |
| Wh per prompt | 0.30 | 0.24 to 0.60 | the measured and modeled spread for a text prompt |
| Battery voltage | 3.85 V | fixed | plain assumption to turn Greenspector mAh rates into Wh; not a claim |

## 5. View 1: The Same Hour on the Same Device

Defaults: phone, Wi-Fi, average network, router by time, 10 short-text prompts, 0.30 Wh per prompt, measured
delivery. Segments in Wh for one hour. "Adds" is data center plus network, the only part that depends on the activity.

| Row | Data center | Network | Adds | Router (fixed) | Device (fixed) | Total | Range of total (all inputs low to high) |
|---|---|---|---|---|---|---|---|
| Chat, 10 prompts | 3.00 (2.40 to 6.00) | 0.0008 (up to 0.033) | 3.00 | 10.0 | 2.00 | 15.0 | 9.28 to 24.0 |
| Streamed video hour, 1 GB | 0.45 (0.029 to 165) | 1.60 | 2.05 | 10.0 | 2.00 | 14.1 | 7.18 to 203 |
| Short-video hour, 0.39 GB | 0.18 (ceiling 13.9) | 0.62 | 0.80 | 10.0 | 2.00 | 12.8 | 7.32 to 44.9 |

What this activity adds, in Wh: chat at 2.52 prompts 0.76, at 10 prompts 3.00, at 30 prompts 9.00, at 60 prompts
18.0; video 2.05; short video 0.80. At the defaults the server (3.00) is already larger than the screen (2.00) on the
chat row; the router is two thirds of every total and explains none of the differences. Kind of chat at 10 prompts:
medium prompt puts chat's data center at 12.2 (total 24.2), reasoning at 39.1 (51.1), high reasoning at 172 (184).
Device (chat, video, short): television 113, 116, 111; laptop 35.0, 35.9, 32.8. Router by data 5.01, 29.1, 12.5; router
excluded 5.00, 4.05, 2.80; cellular 5.01, 27.4 (network 25.0), 11.9; marginal network leaves video's network at 0.13
(total 12.6); the DESNZ follow-up drops the video hour's data center to 0.17 (total 13.8) and the short row's to 0.067
(12.7); 60 prompts put chat's data center at 18.0 and its total at 30.0. Measured segments: chat data center (Google
only), the per-hour figures behind the delivery intensity, phone during video, the 5.88 Wh router. Everything else
is modeled and says so. The widest spread in the table is now on the chat side (kind of chat, 3.00 to 172 Wh for ten
prompts), with the video data center second (0.029 to 165 across devices and intensities, the top end an upper bound).

## 6. View 2: Inside the Data Center Only, Per Person Per Day

| Row | Wh per day | Range | Basis |
|---|---|---|---|
| Average weekly ChatGPT user, 3.67 prompts, text inference only | 1.10 | 0.86 (3.57 x 0.24) to 4.80 (8 x 0.60; the count is unsourced); 1.25 at the 0.34 average | median prompt x mean count over days of non-use: a floor; a per-active-day figure would be higher |
| Meta, per daily active person, all products, AI training and offices | 15.1 | fleet average | reported; another boundary, population and denominator; printed, not ratioed |
| YouTube, 88 minutes on a phone at 1 GB per hour | 0.66 | 0.25 at the DESNZ follow-up; 80.7 at the top-down average, an upper bound | modeled |
| Instagram, 100 minutes at 0.39 GB per hour | 0.29 | 0.11 at the DESNZ follow-up; capped at 15.1, Meta's whole day (9.06 Wh per hour over 100 minutes) | modeled bound; ranking and recommendation compute unmeasured |

Against the household's 28,740 Wh per day, the chat day is 0.0038 percent and Meta's per-person figure 0.053 percent
(fp-016 reaches the same conclusion another way: over 400 messages a day at 0.6 Wh to add 1 percent). The Meta row
is the only reported per-person data center figure for a social platform. It is a fleet average that includes
WhatsApp-only people, so it does not bound a heavy Instagram user from above, and it includes training, ads, and
offices, so it does not sit on the chat row's boundary; the page shows it as its own labeled bar.

## 7. View 3: Heavy AI Against the Same Yardstick

Yardsticks, all printed: one text prompt (0.30 Wh); the view 1 video hour on the reader's device (phone 14.1 Wh whole
chain; 0.45 Wh data center, 0.171 at the DESNZ follow-up); and the published European hour (188 Wh; 53.7 to 263.1,
which includes a television and a by-data router). One text prompt is 76.9 seconds of the phone hour, 5.74 seconds
of the published hour, 40.0 minutes of the phone hour's data center segment on measured delivery, and 6,316 seconds
(1.75 hours) of it at the DESNZ follow-up. The whole-chain yardsticks include the viewer's screen and router, so they flatter AI;
the data-center-only yardstick is like for like but rests on an unsettled allocation of serving energy.

| Unit of AI work | Wh | Text prompts | Hours of the phone video hour (14.1) | Hours of the published hour (188) | Hours of data center only (0.45; DESNZ follow-up 0.171) |
|---|---|---|---|---|---|
| Reasoning query, 15 times longer than typical (Joule, fp-019) | 3.91 (2.15 to 7.05) | 13.0 | 0.28 | | 8.69 (22.9) |
| GPT-5 high reasoning, long query (Jegham preprint, fp-025) | 33.8 | 113 | 2.41 | | |
| One 1024-pixel image, GPU energy doubled (fp-066) | 0.63 | 2.11 | 0.045 | | |
| Veo 3, 8-second clip, modeled estimate (fp-070) | 30.8 (19.8 to 43.4) | 103 | 2.19 | 9.83 minutes | 68.4 (180) |
| Sora 2 Pro, 8-second clip, modeled estimate, the paper's mean (fp-137) | 418.5 (315.1 to 534.4) | 1,395 | 29.8 | 2.23 | |
| Wan2.1 1.3B, open model on one H100, no PUE (fp-068) | 90.5 | 302 | 6.44 | 28.9 minutes | |
| Wan2.1 14B, same rig (fp-069) | 415.1 | 1,384 | 29.5 | 2.21 | |
| CogVideoX, research rig, GPU energy only (fp-067) | 944 | 3,147 | 67.2 | 5.02 (3.59 to 17.6) | 2,098 (5,520) |
| Claude Code, one typed prompt, one heavy user's logs (fp-031) | 150 (60 to 290) | 500 | 10.7 | 0.8 | |
| Claude Code, median session, same user (fp-032) | 600 (250 to 1,200) | 2,000 | 42.7 | 3.19 | |
| Claude Code, average day, same user (fp-032) | 3,000 (1,200 to 5,900) | 10,000 | 214 | 16.0 | |

Overhead differs by row and the page labels it: the image row doubles GPU energy; the Wan rows are GPU, CPU and
RAM on one card with no PUE or idle; CogVideoX is GPU energy alone; Veo and Sora are modeled from machine power;
the agent rows are one self-described heavy user. The full list (o3, DeepSeek-R1, long-context GPT-4o, the 2023
open-model image) is in the JSON. Read: a text prompt is seconds to minutes of streaming depending on the yardstick;
an AI video clip is minutes to hours depending on the model (Veo 3 about ten minutes of the published hour, CogVideoX
five hours); an agent session is hours of streaming on every yardstick.

## 8. View 4: Per-Person Smallness Against Total Growth

- ChatGPT's 2.5 billion messages a day (07/2025, consumer plans, up from about 1 billion in 12/2024) at 0.30 Wh are
  0.27 TWh a year (0.22 at 0.24; 0.31 at the 0.34 average; 0.55 at 0.60), a text-only floor built on a median: 0.056
  percent of the IEA's 485 TWh for all data centers in 2025 (0.11 percent at 0.60) and 0.14 percent of LBNL's 192 TWh
  for the United States in 2024, or 31.2 aMW worldwide. It excludes reasoning, images, video, agents, API traffic, and
  training, and other chat products; if one message in ten ran at the 3.91 Wh reasoning figure the mean would be about
  0.66 Wh, above the slider's top. The IEA's own bound: every web search done as a simple AI query would be under 4 TWh
  (dem-045).
- YouTube's 1 billion hours a day (a 2016 figure, so a floor) at 2.88 GB an hour are 0.47 TWh a year on measured
  delivery, 0.18 TWh at the DESNZ follow-up, and 57.8 TWh at the top-down average, an upper bound; the published whole chain gives 68.6 TWh (19.6 to 96.0), the low end
  reproducing Preist's own 19.6 TWh total, most of it in homes.
- Growth is of another order: the IEA adds 460 TWh worldwide from 2025 to 2030 and LBNL 457 TWh in the United States
  from 2024 to 2030 (reference case); AI-focused data centers grew 50 percent in 2025 (dem-043). Text queries are not
  the growth: the IEA's under-4-TWh bound (dem-045) is less than 1 percent of today's data center use. The Jevons
  pair, no forecast attached: Google's energy per text prompt fell 33 times in a year (fp-009) while Google's total
  electricity grew 37 percent in 2025 (rs-003). A reviewer's OpenAI compute capacity figures are not in the record and
  are not printed; they are a lead in section 13.
- Pacific Northwest (the Council region: Oregon, Idaho, Washington, and Western Montana, a power region, not a
  watershed): the Council's mid workbook case puts data centers alone at 2,020 aMW in 2030, or 17.7 TWh a year (11.4
  to 38.8), roughly 9 percent of today's 22,000 aMW (the arithmetic gives 9.18, but the input is a workbook figure, not
  a forecast of any facility, and whether it is a level or an increment is unstated, dem-073). Data centers are 15 to 41
  percent of regional growth across the draft Ninth Plan futures (dem-063). E3's adequacy gap of 9 GW by 2030 holds
  "without any new resource additions", the same report's review says curtailing data center loads would cut it below
  1 GW (dem-070), and GW is capacity where aMW is energy. The first draft's share of that load served by every ChatGPT
  message on Earth is withdrawn: a 07/2025 count of one product's text messages against a 2030 input, built on a
  median. What a building would run is a question for view 5, not for one person's chat.

## 9. Water and Carbon on the Same Views

- Carbon can ride on views 1 and 2 as energy times a grid factor per segment, location-based only: Google's 345 g
  per kWh for its data centers (fp-007), the US average 370 g (tr-038), LBNL's 0.34 kg (tr-005). Market-based figures
  (Google 0.03 g per prompt, fp-005, against 0.093 location-based) must not mix with location-based rows. Home
  segments take the reader's own grid; the record holds no Pacific Northwest factor, so it stays a reader input. The
  EPA calculator's 1,405.3 lb per MWh non-baseload rate (fp-073) is the carbon version of the marginal-against-average
  dispute: about 637 against 370 g per kWh. Whole-chain streaming carbon exists only as modeled points (56 g per hour
  Carbon Trust 2020 Europe, 14.8 g BBC 2024 UK, 36 g IEA 2019) and Instagram only as Greenspector's 0.87 g per minute
  on a French grid; none shares a boundary with the chat figures.
- Water leaves the headline layer. Per-prompt water (Google's 0.26 mL on site at a 1.15 L per kWh fleet average,
  fp-006, plus about 1.1 mL at the power plant at LBNL's national 4.52 L per kWh, tr-005) describes no grid, season,
  source, or stream, and it invites "a fraction of a teaspoon". It goes in a labeled disclosure together with Li et
  al.'s 16.9 mL (tr-017, GPT-3 era, on site plus generation) and Mistral's 45 mL (fp-027, life cycle), each with its
  boundary and era, never on one bar. What the page shows instead is the design spread in L per kWh by operator on a
  consumption basis (Microsoft 0.27, tr-028; LBNL 0.36 rising to 0.45 to 0.48 after 2023, tr-009; Google 1.15,
  fp-006), with Meta's 0.19 withdrawal figure (tr-025) kept off that bar, and the project view multiplies the
  applicant's own stated figure by the project's TWh. In a hydropower region the reservoir-evaporation convention
  decides generation water, so the page states the convention or leaves it off. Printed beside the spread: "A fleet
  average cannot describe a stream in a low-flow August." Then the reader goes to view 5 and the Water questions
  (source, low flow, cumulative use, discharge temperature, instream needs).

## 10. Everyday Comparators and Their Sources

Agency-sourced: a smartphone charge, 19 Wh (EPA, fp-073); an hour of a 60 W-equivalent LED bulb, 5.9 to 10.5 Wh
(DOE FEMP, fp-135); a household day, 28,740 Wh (EIA, fp-075); a car mile, 400 g CO2 (EPA, fp-074); the IEA's
sentence that a simple text query uses less electricity than running a television for the same time (dem-044).
Partly: an hour of a 100 W television (DESNZ scenario, fp-143; Google and DIMPACT, fp-008, fp-122). No agency
source: a microwave minute (DOE regulates standby power only; 800 W is a Carbon Trust and press convention) and the
2009 Google search (fp-071, company, 17 years old). Chart the first group; print the others with their label or not at all.

## 11. View 5: A Proposed Project

The reader enters a project's MW and load factor. The page prints aMW, TWh a year (`aMW x 8.76 / 1000`), the share
of the region's 22,000 aMW, and site water at the applicant's stated L per kWh, with the operator spread of section
9 as the default range. Illustration at 100 aMW: 0.88 TWh a year (0.876), 0.45 percent of the region, and 237 to
1,007 million liters of site water a year at 0.27 to 1.15 L per kWh. This view sits beside the four comparison views
with equal weight; the owner's brief keeps the relative-use plate first, framed as the answer to "is my chat the
problem?" and nothing more. A fixed panel on every comparison view reads: "This comparison does not decide a
proposal. It says nothing about a site, a stream, a rate class, or Treaty-reserved rights." It links to the Questions
for Tribal Leaders on the data centers page (`site/data-centers/#questions`: Consent, Land, Water, Power, Rates,
Jobs, Data, Exit Terms) and does not duplicate that list; reserved-rights items stay questions for counsel.

## 12. Headline Sentences

Supported at the defaults: "On the same phone for the same hour, what the activity adds is small on every row: ten
text prompts add about 3 Wh in the data center, an hour of video adds about 2 Wh in the data center and network, and
the screen and router add 12 Wh to each row whichever app is open." "Inside the data center, ten text prompts cost
2.4 to 6 Wh; a phone hour of streaming costs about half a watt-hour on measured delivery figures and about 0.2 Wh on
the DESNZ follow-up, and the allocation is unsettled, up to 55 Wh on a top-down average that is an upper bound; ten reasoning prompts cost 39 Wh and ten high-reasoning prompts 172." "A text
prompt is seconds to minutes of streaming depending on the yardstick; an AI video clip is minutes to hours depending
on the model; an agent session is hours of streaming on every yardstick." "Chat at ChatGPT's scale is a few tenths
of a terawatt-hour a year on a text-only, median-prompt floor, about 31 aMW; the buildout adds hundreds of
terawatt-hours."

Not supported: "a ten-prompt chat and an hour of video both land near 15 Wh" (the tie was the default prompt count
plus a constant shared by both rows); "a typical chat day is an order of magnitude below Meta's 15 Wh" (text inference
per weekly user against a fleet average per daily person that includes training; different boundary, population and
denominator); "an AI video clip is hours of streaming even on the yardstick most generous to AI" (Veo 3 is about ten
minutes of the published hour); any share of the 2030 Pacific Northwest data center load made of chat messages; any
single ratio "chat is X times video" or the reverse; "Instagram costs more than ChatGPT" (no measured Instagram data
center figure); any per-hour or per-prompt claim for a named facility in the region; any figure for Claude's own chat
use (Anthropic publishes none, fp-033); "AI uses ten times a search" (2009 basis, fp-071).

## 13. What Would Change the Answer

- A one-method measurement of a chat hour and a video hour on the same phone with data volumes (Greenspector style).
- First-party per-prompt figures from OpenAI or Anthropic with a stated boundary and a stated mean, and a newer
  Google measurement; a per-active-day prompt count.
- A measured per-GB data center intensity for streaming from a current operator: the DESNZ follow-up's 0.171 Wh per GB rests on
  scenario inputs, DIMPACT's 1.3 Wh per hour states no year, and one German operator's 1.15 is the only direct measurement.
- An all-compute, per-user figure for OpenAI or Google on Meta's boundary. A reviewer cites OpenAI compute of 0.6 GW
  in 2024 and about 1.9 GW in 2025 (OpenAI CFO post, 01/18/2026) and Epoch's note that such figures cover research,
  training and inference; neither is in the record, so no number is derived from them here. It needs a claim record.
- A settled convention for routers and networks (by time, by data, or marginal); the IEA and DIMPACT both lean
  marginal, which shrinks every network segment toward zero and leaves the router as a fixed band.
- The reader's own prompts per hour, kind of chat, and device: at 60 short prompts, or ten medium ones, chat's data
  center passes every other segment on a phone.
- A current YouTube hours figure, chat totals beyond ChatGPT, and a Pacific Northwest grid factor.

## 14. Known Weaknesses

- Medians times counts: the chat day, the chat total and the aMW figure multiply a median prompt by a count; Google
  says the mean is higher and reports none, so these are floors, and the only average-class figure (0.34) has no method.
- The per-user denominator is weekly users over all days; Meta's is daily active people; the two rows are printed,
  not compared.
- The router by time charges a shared always-on device's full draw to one person's hour, the same on every row; the
  record's one metered router (5.88 Wh) sits below the modeled range, now its low end.
- The chat device segment is battery rates and a voltage assumption, not a wall meter, and the Greenspector chat
  uplift (1.05 to 1.36 times video) is set aside; the chat network segment is one phone-app test with one exact figure.
- The streaming delivery intensity (0.45 Wh per GB) is this file's arithmetic from a DIMPACT hour and a Carbon Trust
  data mix; the short-video data center segment charges delivery only, with Meta's fleet average as a ceiling, and no
  source measures a feed's ranking compute.
- The kind-of-chat values above 0.60 come from a preprint that a peer-reviewed paper says overstates production
  figures 4 to 20 times (fp-020); multi-turn context growth and model calls per chat prompt are unmeasured.
- Network intensities are 2020 regressions and a 2024 extrapolation; the marginal values are this file's arithmetic
  from Carbon Trust's figure parameters (fp-129, partly).
- Every chat data center figure is operator-published or industry-authored; only Google's is production data. The
  streaming defaults are also industry-authored (DIMPACT members, Carbon Trust) or Meta-commissioned (ENGIE), and
  DESNZ's is a government scenario; section 3 labels each.
- Prompts per hour, prompts per day, and minutes per day mix a modeled hour with Android-only app averages.
- Scale uses 2016 YouTube hours and ChatGPT only; the Council's data center series is a workbook input, not a forecast
  of any facility, and whether it is a level or an increment is unstated (dem-073).
- Ranges are input extremes, not probabilities; the default is one defensible point, not a central estimate.

## 15. Attacks and How They Were Resolved

Four reviews (arithmetic, too kind to AI, too hard on AI, Tribal reader) reached this editor with their text cut
after arithmetic item 6, too-kind item 5, too-hard item 4 and Tribal item 4; the items after those cuts were not
seen and are not claimed resolved. Every number the reviewers recomputed reproduced, so the items were about method.

Arithmetic. (1) Instagram's "up to 23.2" exceeded Meta's 15.1 per day: fixed, the per-day high is capped at 15.1 and
the per-hour ceiling over 100 minutes is 9.06. (2) Headlines failed on the page's own yardsticks: fixed, view 3 takes
its whole-chain divisor from the view 1 hour for the reader's device, prints the published hour and the data-center-
only ratio beside it, and the sentence now reads seconds to minutes and minutes to hours. (3) The highs were DESNZ's
medium: fixed, the data center high is DESNZ's high case (30.1 Wh per GB, 105.5 Wh for its 3.5 GB hour), the whole-
chain range is 53.7 to 417.5 with fp-120 as the low anchor, and YouTube's whole chain is 19.6 to 152 TWh. (4) Medians
times counts: fixed, the rows are labeled floors and the sums are also run at the 0.34 average (1.25 Wh a day, 0.31
TWh). Jegham's 0.42 was not used as a mean: it is a point estimate for one fixed prompt size, not a mean over use.
(5) Denominators: fixed, the row is "average weekly user", 8 prompts is marked unsourced, and the low is the low
count times the low prompt (0.86). (6) The router: fixed, a separate fixed band with 5.88 in its range and an "adds"
column that excludes it. (7 to 8) Not received.

Too kind to AI. (1) The Meta sentence reverses on a like-for-like boundary: fixed, moved to not supported, row renamed
"text inference only"; the OpenAI all-compute row is not added because its figures are not in the record (section 13
holds the lead). (2) The chat total: fixed, labeled text-only floor, median prompt, 07/2025, run at the mean, with
the reasoning-share arithmetic and the Jevons pair (fp-009 against rs-003) and the 12/2024 to 07/2025 growth stated.
(3) No way to pick the chat people use: fixed, the kind-of-chat setting (0.30, 1.215, 3.91, 17.15) with the preprint
label, the fp-020 dispute and the unmeasured multi-call line; the 1.215 is labeled as Jegham's medium query rather
than "longer replies and context", since context growth is unmeasured. (4) "Both land near 15 Wh": fixed, the adds
column and a rewritten headline; the 1.05 to 1.36 device uplift stays set aside and is named in section 14. (5 on)
Not received; the first clause (video gets inflators, chat none) is answered by the kind-of-chat setting, which makes
chat the widest spread in the table.

Too hard on AI. (1) The 70 Wh is not an encoding and storage allocation: fixed and verified in DESNZ Tables 5.3 and
5.4 (streaming "attributed entirely" to the user at 0.015 kWh per GB; shared shares about 0.00001 kWh). The setting is
now a per-GB serving intensity, every video row is GB times intensity, the short row moves with it (7.64 Wh at
DESNZ), the fp-043 note is corrected, and "allocation dispute" is gone. (2) The 15 Wh tie: fixed as above, with
presets 2.52, 10, 30 and 60 and the server's share named. (3) "Hours of streaming even on the most generous
yardstick": fixed, commercial estimates lead, rigs and single-user rows are labeled, overhead is stated per row, both
yardsticks appear in the seconds claim. (4) The Meta sentence and "bounds Instagram from above": fixed, both
withdrawn. (5 on) Not received.

Tribal reader. (1) The method never reaches the decision: fixed, view 5 (MW and load factor to aMW, TWh, regional
share and site water) with the fixed panel on every view linking to the existing Questions for Tribal Leaders; the
order of views stays the owner's (relative use first, as the brief ranks it), with equal weight, not first place.
(2) The 1.55 percent line: fixed, deleted and replaced by the 31.2 aMW sentence with its exclusions; median against
mean added to section 14. (3) Per-prompt water: fixed, off the headline layer, L per kWh spread with withdrawal
separated, 16.9 and 45 mL in a labeled disclosure, tr-009's rise included, the low-flow sentence printed, and the
reader sent to view 5 and the Water questions. (4) "Columbia Basin": fixed, the Council region is named as a power
region, the share reads "roughly 9 percent" with the workbook caveat beside it, the 9 GW carries "without any new
resource additions" and the curtailment review, GW is distinguished from aMW, the absolution line is reworded, and
the growth attribution now rests on dem-045 and dem-043. (5 on) Only the opening clause arrived (carbon's regional
grid factor); section 9 already keeps the Pacific Northwest factor as a reader input because the record holds none.
