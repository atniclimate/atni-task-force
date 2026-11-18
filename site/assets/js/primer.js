// Kinds of Data Centers: the stepper, and a WebGL 1 scene drawn only on a change; the still SVG stands in until it starts (DESIGN-SPEC D, 3D).
(function () {
  // Boxes [group, style, x, y, z, w, h, d], meters, y up. Groups: 1 desk, 2 closet, 3 office, 4 room, 5 its racks, 6 the parts, 7 colocation, 8 hyperscale,
  // 9 region. Styles: s solid, p solid in ink, w wire, q wire in ink, d pad, r ring.
  const B = [],L = [];
  const box = (g,s,x,y,z,w,h,d)=>B.push([g,s,x,y,z,w,h,d]);
  const row = (n,dx,dz,f)=>{for (let i = 0;i < n;i++) f(i * dx,i * dz,i);};
  const person = (g,x,z)=>{box(g,'p',x-.15,0,z-.1,.13,.86,.2);box(g,'p',x+.02,0,z-.1,.13,.86,.2);box(g,'p',x-.21,.86,z-.13,.42,.62,.26);box(g,'p',x-.1,1.51,z-.11,.2,.24,.22);};
  const hall = (g,s,x,z)=>box(g,s,x,0,z,300,16,120);
  box(1,'s',-.6,0,-.3,1.2,.74,.6);box(1,'s',-.12,.74,-.06,.33,.02,.23);box(1,'s',-.12,.76,-.07,.33,.22,.012);person(1,-1.05,.2);
  box(2,'d',-1,0,-4.1,2.4,0,3);box(2,'s',-1,0,-4.1,2.4,2.7,.08);box(2,'s',-1,0,-4.1,.08,2.7,3);
  box(2,'w',-.2,0,-4,.6,1,.8);box(2,'s',-.17,.04,-3.97,.54,.22,.74);box(2,'s',-.17,.36,-3.97,.54,.18,.74);box(2,'s',-.17,.66,-3.97,.54,.05,.6);person(2,-.45,-1.9);
  box(3,'w',-1.6,0,-26,40,12,27.2);box(3,'r',-1.6,4,-26,40,0,27.2);box(3,'r',-1.6,8,-26,40,0,27.2);
  box(4,'d',24,0,-15,12,0,7);box(4,'w',24,0,-15,12,3,7);
  row(6,.6,0,(dx)=>{box(5,'s',26+dx,0,-13.8,.6,2,1.2);box(5,'s',26+dx,0,-11.2,.6,2,1.2);});
  box(5,'s',32.6,0,-14.4,2.4,2,1);box(5,'s',32.8,0,-10.4,1.2,1.9,.6);person(5,30.6,-11.4);
  box(6,'s',25.8,2.4,-12.7,4,.08,.4);box(6,'s',27.8,2.4,-14.2,.3,.08,4.2);box(6,'s',39.2,0,-13.4,4,2.2,2);
  box(7,'w',50,0,-110,120,14,70);
  row(3,34,0,(dx,_,i)=>row(2,0,34,(_x,dz,j)=>{
    const own = !i && j;
    box(7,own ? 'w' : 'q',60+dx,0,-100+dz,18,3,12);
    row(10,.6,0,(rx)=>{box(7,own ? 's' : 'p',63+dx+rx,0,-98+dz,.6,2,1.2);box(7,own ? 's' : 'p',63+dx+rx,0,-95+dz,.6,2,1.2);});
  }));
  row(5,22,0,(dx)=>{box(7,'s',58+dx,14,-98,8,2.5,5);box(7,'s',58+dx,14,-64,8,2.5,5);});
  row(8,0,7.5,(_,dz)=>box(7,'s',174,0,-102+dz,12,4,3));box(7,'d',192,0,-88,20,0,20);row(3,6,0,(dx)=>box(7,'s',195+dx,0,-80,4,4,4));
  row(3,340,0,(dx)=>row(2,0,160,(_,dz)=>{hall(8,'s',250+dx,-470+dz);box(8,'s',270+dx,16,-455+dz,260,2.5,90);row(18,16,0,(gx)=>box(8,'s',262+dx+gx,0,-347+dz,12,4,3));}));
  box(8,'d',1290,0,-330,150,0,150);row(3,40,0,(dx)=>row(2,0,50,(_,dz)=>box(8,'s',1310+dx,0,-305+dz,14,10,14)));
  const pylon = [[1510,-290],[1630,-350],[1750,-410],[1870,-470]];
  pylon.forEach((p,i)=>{box(8,'s',p[0]-2,0,p[1]-2,4,44,4);L.push([8,...(i ? [pylon[i-1][0],44,pylon[i-1][1]] : [1440,10,-255]),p[0],44,p[1]]);});
  row(3,340,0,(dx)=>{hall(9,'w',5600+dx,-3100);hall(9,'w',1100+dx,-8300);});
  [[740,-310],[6110,-3040],[1610,-8240]].forEach((p)=>L.push([9,0,1,0,p[0],1,p[1]]));
  const hull = [[120,-90],[1400,-90],[6700,-2880],[6700,-3260],[2150,-8480],[950,-8480],[120,-600]];
  hull.forEach((p,i)=>L.push([9,p[0],0,p[1],hull[(i+1) % 7][0],0,hull[(i+1) % 7][1]]));

  // Stops: camera [target, distance, azimuth, elevation]; group inks (. hidden, m muted, f faint, h half, i the stop before, o this one); labels
  // [words, x, y, z, b before / r right], no digits.
  const STOPS = [
    [[-.1,.85,.05,4.6,35,20],'o',[['Laptop',.04,1,-.07],['Desk',.6,.5,.3,'r'],['A person, for scale',-1.05,1.78,.2]]],
    [[.2,1.25,-2.4,7.6,35,24],'io',[['Server closet',1.4,2.7,-4.1],['Network switch',.4,.69,-3.4,'r'],['Server',.4,.45,-3.2,'r'],['Battery backup',.4,.15,-3.2,'r'],['Laptop',.04,1,-.07,'b']]],
    [[17,3,-12.5,96,35,30],'mihoo',[['Office building',18.4,12,-26],['Server room',36,3,-15],['Racks',27.5,2,-12.6],['Cooling unit',36,1,-13.9,'r'],['Server closet',1.4,2.7,-4.1,'b']]],
    [[35.5,1.2,-12,33,40,38],'mmfioo',[['Computing',26.6,2,-13.2],['Storage',29.6,1.2,-10,'r'],['Network',30,2.48,-12.5],['Power',34,1.2,-10.1,'r'],['Cooling',34.4,2,-14.4],['Backup',41.2,2.2,-12.4],['Server room',24.2,3,-14.8,'b']]],
    [[108,8,-50,470,35,30],'mmihhmo',[['Colocation building',150,14,-110],['One customer’s cage',69,3,-60],['Other customers’ cages',137,3,-60],['Rooftop cooling',102,16.5,-96],['Generators',180,4,-102],['Substation',212,0,-78,'r'],['Office building',18.4,12,1.2,'b']]],
    [[880,10,-400,3250,35,32],'mmmmmmio',[['Hyperscale campus',740,18,-470],['Data halls',1230,16,-360,'r'],['Power lines',1750,44,-410],['Colocation building',110,14,-40,'b']]],
    [[1450,0,-4000,20500,30,48],'mmmmmmmio',[['You, renting',0,1,0],['The network',3055,1,-1520],['A provider’s region',4425,0,-5870,'r'],['Hyperscale campus',1230,16,-150,'br']]],
  ];
  const INK = { '.': [0,0,0], m: [1,0,0], f: [.25,0,0], h: [1,0,.5], i: [1,0,1], o: [1,1,0] };
  window.primerScene = { B, L, STOPS }; // still.js

  const root = document.getElementById('primer');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const stops = [...root.querySelectorAll('.primer-stop')], links = [...root.querySelectorAll('.primer-steps a')];
  const where = $('.primer-where'), back = $('[data-step="-1"]'), next = $('[data-step="1"]'), full = $('[data-full]');
  const media = (q) => window.matchMedia && matchMedia(q).matches;
  const still = () => media('(prefers-reduced-motion: reduce)');
  let cur = -1, scene = null;

  function go(i, cut) {
    if (i < 0 || i === cur) return;
    links.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
    stops.forEach((s, k) => s.classList.toggle('is-current', k === i));
    where.textContent = `Stop ${i + 1} of ${stops.length}: ${links[i].textContent}`;
    back.disabled = !i;
    next.textContent = i === stops.length - 1 ? 'Self-check' : 'Next';
    if (cur >= 0) try { history.replaceState(null, '', `#${stops[i].id}`); } catch (e) { /* throttled */ }
    cut = cut || cur < 0;
    cur = i;
    if (scene) scene(i, cut);
  }
  function step(n) {
    const i = cur + n, behavior = still() ? 'auto' : 'smooth';
    if (i >= stops.length) document.getElementById('check').scrollIntoView({ behavior });
    else if (i >= 0) { go(i); stops[i].scrollIntoView({ behavior, block: 'start' }); }
  }
  back.onclick = () => step(-1);
  next.onclick = () => step(1);
  document.addEventListener('keydown', (e) => {
    const t = e.target, r = root.getBoundingClientRect();
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || !/^Arrow(Right|Left)$/.test(e.key)) return;
    if ((t === document.body ? r.bottom < 0 || r.top > innerHeight : !root.contains(t)) || t.closest('input, select, textarea, [contenteditable]')) return; // with nothing focused, only while the stepper shows
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  });
  go(Math.max(0, stops.findIndex((s) => `#${s.id}` === location.hash)), true);
  if ('IntersectionObserver' in window) {
    const band = parseFloat(getComputedStyle(root).getPropertyValue('--pr-band')) || 40; // read once
    const seen = new IntersectionObserver((list) => list.forEach((e) => e.isIntersecting && go(stops.indexOf(e.target))), { rootMargin: `-${band}% 0px -${95 - band}% 0px` });
    stops.forEach((s) => seen.observe(s));
  }
  if (full && root.requestFullscreen) {
    full.hidden = false;
    full.onclick = () => Promise.resolve(document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen()).catch(() => {});
    document.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === root;
      full.textContent = on ? 'Leave full screen' : 'Full screen';
      stops[cur].scrollIntoView({ block: 'start' });
    });
  }
  window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach((d) => { d.open = true; }));

  // Forced colors or no WebGL keep the still.
  const view = $('.primer-view'), canvas = $('.primer-canvas'), labels = $('.primer-labels'), stage = $('.primer-stage');
  const gl = !media('(forced-colors: active)') && canvas.getContext('webgl', { alpha: false });
  if (!gl) return;
  // Edges are quads widened on screen, since WebGL lines stay one pixel.
  const VS = `attribute vec3 p,q,k;uniform mat4 M;uniform vec2 V;uniform float E,W,A[10],H[10],P[10];uniform vec3 S,I,O,F0,F1,F2;varying vec4 c;
void main(){int g=int(k.y);float a=A[g],h=H[g],i=P[g];if(k.z>.5){i=max(i,h);h=0.;}vec4 X=M*vec4(p,1.);
if(E>.5){vec4 Y=M*vec4(q,1.);if(X.w<.01){if(Y.w<.01)a=0.;else X=mix(X,Y,(.01-X.w)/(Y.w-X.w));}vec2 s=(Y.xy/Y.w-X.xy/X.w)*V+vec2(1e-6,0.);X.xy+=normalize(vec2(-s.y,s.x))/V*k.x*W*(1.+h+.4*i)*X.w;
a*=.32+.68*max(h,i);c=vec4(mix(mix(S,I,i),O,h)*a,a);}else c=vec4((k.x<.5?F0:k.x<1.5?F1:F2)*a,a);
gl_Position=a<.01?vec4(2.,2.,2.,1.):X;}`;
  const prog = gl.createProgram();
  [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, 'precision mediump float;varying vec4 c;void main(){gl_FragColor=c;}']].forEach(([type, src]) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(prog, sh);
  });
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const u = (n) => gl.getUniformLocation(prog, n);

  // Nine floats a vertex: this end, other end, shade or side, group, ink flag.
  const faces = [], edges = [];
  const edge = (a, b, g, f) => [[a, b, 1], [a, b, -1], [b, a, 1], [a, b, 1], [b, a, 1], [b, a, -1]].forEach(([m, n, s]) => edges.push(...m, ...n, s, g, f));
  B.forEach(([g, s, x, y, z, w, h, d]) => {
    const f = +'pq'.includes(s), c = (n) => [x + (n & 1) * w, y + (n >> 1 & 1) * h, z + (n >> 2 & 1) * d];
    for (let n = 0; n < 8; n++) [1, 2, 4].forEach((bit) => { if (!(n & bit) && !('dr'.includes(s) && (bit === 2 || n & 2))) edge(c(n), c(n | bit), g, f); });
    if ('spd'.includes(s)) [[2, 3, 7, 6, 0], [4, 5, 7, 6, 1], [1, 3, 7, 5, 2]].forEach((q) => { if (s !== 'd' || !q[4]) [0, 1, 2, 0, 2, 3].forEach((n) => faces.push(...c(q[n]), 0, 0, 0, q[4], g, f)); });
  });
  L.forEach(([g, ...xyz]) => edge(xyz.slice(0, 3), xyz.slice(3), g, 0));
  const bufs = [faces, edges].map((a) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); return [b, a.length / 9]; });
  const attrs = ['p', 'q', 'k'].map((n) => gl.getAttribLocation(prog, n));
  attrs.forEach((a) => gl.enableVertexAttribArray(a));
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.polygonOffset(1, 1);

  // Colors: hex tokens from primer.css, read again on a theme change.
  let bg;
  const hex = (n) => { const t = getComputedStyle(stage).getPropertyValue(`--pr-${n}`).trim(); return [1, 3, 5].map((i) => parseInt(t.slice(i, i + 2), 16) / 255); };
  function colors() {
    bg = hex('ground');
    const ink = hex('ink');
    ['S', 'I', 'O'].forEach((n, i) => gl.uniform3fv(u(n), hex(['sec', 'ink', 'here'][i])));
    (bg[0] + bg[1] + bg[2] > 1.5 ? [.03, .08, .14] : [.14, .08, .035]).forEach((m, i) => gl.uniform3fv(u(`F${i}`), bg.map((v, j) => v + (ink[j] - v) * m)));
  }

  // Camera and inks ease together, distance in log space; a view taller than the desktop stage backs off.
  const state = (i) => [...STOPS[i][0].map((v, k) => (k === 3 ? Math.log(v) : v)), ...[...Array(10)].flatMap((_, n) => INK[STOPS[i][1][n - 1] || '.'])];
  let now = state(cur), from, to, t0, frame = 0, M;
  const ease = (x) => x * x * (3 - 2 * x);
  function matrix(w, h) {
    const [tx, ty, tz, ld, az, el] = now, a = az * Math.PI / 180, e = el * Math.PI / 180, d = Math.exp(ld) * Math.max(1, 1.1 * h / w);
    const Z = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)], eye = [tx, ty, tz].map((v, k) => v + d * Z[k]);
    const R = [Math.cos(a), 0, -Math.sin(a)], U = [Z[1] * R[2], Z[2] * R[0] - Z[0] * R[2], -Z[1] * R[0]];
    const dot = (v) => -(v[0] * eye[0] + v[1] * eye[1] + v[2] * eye[2]), n = d / 40, f = d * 40, s = 1 / Math.tan(Math.PI / 12);
    [R, U, Z].forEach((v) => v.push(dot(v)));
    return new Float32Array([0, 1, 2, 3].flatMap((c) => [s * h / w * R[c], s * U[c], ((f + n) * Z[c] + (c > 2 ? 2 * f * n : 0)) / (n - f), -Z[c]]));
  }
  function draw() {
    const r = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(view.clientWidth * r)), h = Math.max(1, Math.round(view.clientHeight * r));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(...bg, 1);
    gl.depthMask(true); // clear honors the mask, which the edge pass leaves off
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u('M'), false, M = matrix(w, h));
    gl.uniform2f(u('V'), w / 2, h / 2);
    gl.uniform1f(u('W'), .55 * r);
    ['A', 'H', 'P'].forEach((n, j) => gl.uniform1fv(u(n), [...Array(10)].map((_, g) => now[6 + g * 3 + j])));
    bufs.forEach(([b, count], e) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      attrs.forEach((a, i) => gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, i * 12));
      gl.uniform1f(u('E'), e);
      gl.depthMask(!e);
      gl[e ? 'disable' : 'enable'](gl.POLYGON_OFFSET_FILL);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    });
  }
  function place() {
    for (const el of labels.children) {
      const c = [0, 1, 2, 3].map((k) => M[k] * el.at[0] + M[4 + k] * el.at[1] + M[8 + k] * el.at[2] + M[12 + k]), x = c[0] / c[3], y = c[1] / c[3];
      el.hidden = c[3] <= 0 || Math.abs(x) > 1 || Math.abs(y) > 1;
      el.style.left = `${(x + 1) / 2 * view.clientWidth}px`;
      el.style.top = `${(1 - y) / 2 * view.clientHeight}px`;
    }
  }
  function show(i) {
    labels.replaceChildren(...STOPS[i][2].map(([words, x, y, z, flag = '']) => {
      const el = document.createElement('span');
      el.className = `primer-label${flag.includes('b') ? ' is-before' : ''}${flag.includes('r') ? ' is-right' : ''}`;
      el.textContent = words;
      el.at = [x, y, z];
      return el;
    }));
    place();
    requestAnimationFrame(() => labels.classList.add('is-on'));
  }
  function tick(time) {
    t0 = t0 || time;
    const x = Math.min(1, (time - t0) / 700), k = ease(x);
    now = from.map((v, i) => v + (to[i] - v) * k);
    draw();
    if (x < 1) frame = requestAnimationFrame(tick);
    else { frame = 0; show(cur); }
  }
  scene = (i, cut) => {
    cancelAnimationFrame(frame);
    labels.classList.remove('is-on');
    from = now; to = state(i); t0 = 0;
    if (cut || still() || !view.clientWidth) { now = to; draw(); show(i); } else frame = requestAnimationFrame(tick);
  };

  colors();
  root.classList.add('is-live');
  draw();
  show(cur);
  const redraw = () => { if (!frame) { draw(); place(); } }, recolor = () => { colors(); redraw(); };
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(view); else window.addEventListener('resize', redraw);
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); // theme.js sets only light or dark
  canvas.addEventListener('webglcontextlost', () => { scene = null; cancelAnimationFrame(frame); root.classList.remove('is-live'); });
})();
