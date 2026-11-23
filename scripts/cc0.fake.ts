// A library for the tests of `cc0.ts` and `bake.ts`: a `scripts/cc0-textures/cc0-textures.mjs` of the real one's
// shape (`read`, `resolve`, `download`), whose `download` copies a set from `fixtures/<zip>/` instead of
// fetching it and logs each call to `downloads.log`, and a list of sets in `textures/cc0-textures.json`.
import fs from 'node:fs'
import path from 'node:path'

const MODULE = `
import fs from 'node:fs'
import path from 'node:path'
export const read = (library) => JSON.parse(fs.readFileSync(path.join(library, 'textures', 'cc0-textures.json'), 'utf8'))
export const resolve = (directory, name) => {
  if (directory[name]) return name
  throw new Error(\`no cc0-textures set \${name} (yarn cc0-textures:search <words>)\`)
}
export const download = async (directory, zip, { library }) => {
  fs.appendFileSync(path.join(library, 'downloads.log'), zip + '\\n')
  const dir = path.join(library, 'textures', 'cc0-textures', zip)
  if (!fs.existsSync(dir)) fs.cpSync(path.join(library, 'fixtures', zip), dir, { recursive: true })
  return { dir, fetched: true }
}
`

// A library at `library`, its list empty.
export const fakeLibrary = (library: string) => {
  fs.mkdirSync(path.join(library, 'scripts', 'cc0-textures'), { recursive: true })
  fs.mkdirSync(path.join(library, 'textures'), { recursive: true })
  fs.writeFileSync(path.join(library, 'scripts', 'cc0-textures', 'cc0-textures.mjs'), MODULE)
  fs.writeFileSync(path.join(library, 'textures', 'cc0-textures.json'), '{}')
}

// A set `zip` in the library's list, its zip holding the files named, each holding its own name.
export const fakeSet = (library: string, zip: string, files: string[]) => {
  const list = path.join(library, 'textures', 'cc0-textures.json')
  const directory = JSON.parse(fs.readFileSync(list, 'utf8'))
  directory[zip] = { zip: `cc0t/${zip}.zip`, tags: [], maps: files }
  fs.writeFileSync(list, JSON.stringify(directory))
  fs.mkdirSync(path.join(library, 'fixtures', zip), { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(library, 'fixtures', zip, f), f)
}

// The sets downloaded, in order.
export const downloads = (library: string) => {
  const log = path.join(library, 'downloads.log')
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []
}

// A `pro-ng/material/compose.js` of the real one's shape, for the tests of the bake's looks tool: the
// materials grouped into the three draw calls as the real one groups them, each call's shader a
// preamble, every look's `code`, one `look_<id>` a material, the relief looks' `lookShadow_<id>`, and
// `lookRun` and `lookShadow` written as the real one writes them, so what the tool cuts out of one
// call and puts into another is cut as it will be from the library's.
const COMPOSE = `
export const PICTURE = 1024;
const BASE = 'flat varying float vLookId;\\nvarying vec3 vLookInfo;\\nvarying vec2 vLookUv;\\nvarying vec3 vLookWorld;\\nvarying vec3 vLookWN;\\nvec2 lookGx, lookGy;\\nstruct Look { vec3 colour; float rough; };\\nLook lookStart() { Look k; k.colour = vec3(0.5); k.rough = 0.8; return k; }\\n';
const NEEDS = { noise: ['noise'], random: ['random'], layout: ['courses'] };
const FEATURES = { clearcoat: /k\\.clearcoat\\b/, sheen: /k\\.sheen\\b/, iridescence: /k\\.iridescence\\b/, dispersion: /k\\.dispersion\\b/, transmission: /k\\.transmission\\b/ };
const typeOf = (v) => (Array.isArray(v) ? (v.length === 3 ? 'vec3' : null) : typeof v === 'number' ? 'float' : null);
const valueOf = (p) => (p !== null && typeof p === 'object' && !Array.isArray(p) ? p.value : p);
export function composeScene(materials, shared) {
  const pictures = [];
  const pictureAt = (p) => {
    let i = pictures.findIndex((q) => q.set === p.set && q.file === p.file);
    if (i < 0) { pictures.push({ set: p.set, file: p.file, colour: !!p.colour }); i = pictures.length - 1; }
    return i;
  };
  const uniforms = {};
  const needs = new Set();
  const callOf = (m) => (m.look.seeThrough ? 'seeThrough' : m.look.shadow ? 'relief' : 'solid');
  const wrapped = materials.map((m, id) => {
    const sets = [];
    const declare = [];
    for (const [name, def] of Object.entries(m.look.params || {})) {
      const v = m.settings && name in m.settings ? m.settings[name] : valueOf(def);
      const type = typeOf(v);
      if (!type) throw new Error(\`look \${m.lookName}: setting \${name} is not a number or a colour [r, g, b]\`);
      uniforms[\`L\${id}_\${name}\`] = { type, value: Array.isArray(v) ? [...v] : v };
      declare.push(\`uniform \${type} L\${id}_\${name};\`);
      sets.push(\`  p_\${name} = L\${id}_\${name};\`);
    }
    for (const [name, p] of Object.entries(m.look.pictures || {})) sets.push(\`  t_\${name} = \${pictureAt(p)};\`);
    for (const s of m.look.shared || []) for (const n of NEEDS[s] || []) needs.add(n);
    return {
      declare: declare.join('\\n'),
      run: \`void look_\${id}(inout Look k) {\\n\${sets.join('\\n')}\\n\${m.look.body}\\n}\\n\`,
      shadow: m.look.shadow ? \`float lookShadow_\${id}(vec3 Lview) {\\n\${m.look.shadow}\\n}\\n\` : '',
      hasShadow: !!m.look.shadow,
    };
  });
  const build = (ids) => {
    if (!ids.length) return null;
    const looks = [...new Set(ids.map((id) => materials[id].lookName))];
    const sharedNames = [...new Set(looks.flatMap((n) => materials.find((m) => m.lookName === n).look.shared || []))];
    for (const s of sharedNames) if (!(s in shared)) throw new Error(\`no shared chunk \${s} (looks/shared/\${s}.js)\`);
    const code = looks.map((n) => materials.find((m) => m.lookName === n).look.code || '').join('\\n');
    const features = {};
    for (const [f, re] of Object.entries(FEATURES)) features[f] = looks.some((n) => re.test(materials.find((m) => m.lookName === n).look.body));
    const dispatch = \`switch (id) {\\n\${ids.map((id) => \`    case \${id}: look_\${id}(k); break;\`).join('\\n')}\\n  }\`;
    const withShadow = ids.filter((id) => wrapped[id].hasShadow);
    const shadowDispatch = withShadow.length ? \`switch (id) {\\n\${withShadow.map((id) => \`    case \${id}: return lookShadow_\${id}(Lview);\`).join('\\n')}\\n  }\` : '';
    const fragmentPars = \`\${BASE}\\n\${ids.map((id) => wrapped[id].declare).join('\\n')}\\n\${sharedNames.map((s) => shared[s]).join('\\n')}\\n\${code}\\n\${ids.map((id) => wrapped[id].run).join('\\n')}\\n\${ids.map((id) => wrapped[id].shadow).join('\\n')}\\n\` +
      \`Look lookRun(int id) {\\n  Look k = lookStart();\\n  \${dispatch}\\n  return k;\\n}\\n\` +
      \`float lookShadow(int id, vec3 Lview) {\\n  \${shadowDispatch}\\n  return 1.0;\\n}\\n\`;
    return { ids, fragmentPars, features };
  };
  const group = (wanted) => materials.map((m, id) => [m, id]).filter(([m]) => callOf(m) === wanted).map(([, id]) => id);
  return {
    solid: build(group('solid')),
    relief: build(group('relief')),
    seeThrough: build(group('seeThrough')),
    callOf: (id) => callOf(materials[id]),
    vertexPars: 'attribute float lookId;\\nattribute vec3 lookInfo;\\n',
    vertexMain: 'vLookId = lookId;\\nvLookInfo = lookInfo;\\nvLookUv = uv;\\n',
    uniforms,
    knobs: [],
    pictures,
    needs: [...needs],
  };
}
`

// The looks the fake pro-ng holds: `rock` reads Rock007's colour picture, `cobble` has a setting, a
// shared noise chunk and a shadow of its own (a relief look), `glass` is see-through.
const LOOKS: Record<string, string> = {
  rock: `export default {
  pictures: { col: { set: 'Rock007_4K-JPG', file: 'Rock007_4K_Color.jpg', colour: true } },
  body: 'k.colour = picColour(t_col, uv, 1.0);',
};
`,
  cobble: `export default {
  params: { size: { value: 0.15, min: 0.05, max: 0.4, step: 0.005, label: 'Cobble size (m)' }, grey: [0.2, 0.2, 0.2] },
  shared: ['noise'],
  code: 'float cbN(vec2 p) { return csTN(p); }',
  body: 'k.colour = p_grey * cbN(uv / p_size);',
  shadow: '  float s = 1.0;\\n  for (int i = 0; i < 6; i++) {\\n    s = min(s, 1.0);\\n  }\\n  return s;',
};
`,
  glass: `export default {
  seeThrough: true,
  body: 'k.colour = vec3(0.9); k.alpha = 0.3;',
};
`,
}
const SHARED: Record<string, string> = {
  noise: "export default 'uniform sampler2D csNoise;\\nfloat csTN(vec2 p) { return texture(csNoise, p / 32.0).r; }';\n",
  layout: "export default 'uniform sampler2D csCourses;';\n",
  random: "export default 'uniform sampler2D cbRand;';\n",
}

// The library's pro-ng, faked: `pro-ng/material/compose.js`, the looks above and the shared chunks.
export const fakeProng = (library: string) => {
  const material = path.join(library, 'pro-ng', 'material')
  fs.mkdirSync(path.join(material, 'looks', 'shared'), { recursive: true })
  fs.writeFileSync(path.join(material, 'compose.js'), COMPOSE)
  for (const [name, text] of Object.entries(LOOKS)) fs.writeFileSync(path.join(material, 'looks', `${name}.js`), text)
  for (const [name, text] of Object.entries(SHARED)) fs.writeFileSync(path.join(material, 'looks', 'shared', `${name}.js`), text)
}
