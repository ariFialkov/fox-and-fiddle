// Post-build: rewrite every .glb in dist/ as a glTF JSON file plus its texture images, for hosts that refuse
// .glb files. Lossless: the same glTF (meshes, skins, quantized vertex data, texture transforms), the textures
// as their original JPEG/PNG bytes in their own files, and the remaining binary data (geometry, skin weights,
// animation) embedded in the JSON as base64. The game's loader (GLTFLoader) reads either form.
//
// The model files get MODEL_EXT (default .json, the type hosts accept most widely; set MODEL_EXT=gltf for the
// standard extension). The art index (scripts/reskin-files.js) points at the same names when building.
import fs from 'node:fs';
import path from 'node:path';

export const MODEL_EXT = (process.env.MODEL_EXT || 'json').replace(/^\./, '');

/** One GLB (Buffer) -> { json: object, images: [{ file, bytes }] }; `base` names the image files. */
export function glbToGltf(glb, base) {
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < glb.length) {
    const len = glb.readUInt32LE(off), type = glb.readUInt32LE(off + 4), data = glb.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB without JSON');
  const views = json.bufferViews || [];
  const viewBytes = (v) => bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  // images out to files, byte for byte
  const images = [];
  const imageViews = new Set();
  (json.images || []).forEach((img, i) => {
    if (img.bufferView == null) return;
    const v = views[img.bufferView];
    const ext = img.mimeType === 'image/png' ? 'png' : img.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const file = `${base}.${i}.${ext}`;
    images.push({ file, bytes: Buffer.from(viewBytes(v)) });
    imageViews.add(img.bufferView);
    delete img.bufferView;
    img.uri = encodeURIComponent(file);
  });
  // the rest of the binary data, repacked without the images (each view 4-byte aligned), renumbered
  const remap = new Map(), keep = [], parts = [];
  let size = 0;
  views.forEach((v, i) => {
    if (imageViews.has(i)) return;
    const pad = (4 - (size % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); size += pad; }
    const bytes = viewBytes(v);
    remap.set(i, keep.length);
    keep.push({ ...v, buffer: 0, byteOffset: size });
    parts.push(bytes); size += bytes.length;
  });
  const fix = (o) => { if (o && o.bufferView != null) o.bufferView = remap.get(o.bufferView); };
  for (const a of json.accessors || []) { fix(a); if (a.sparse) { fix(a.sparse.indices); fix(a.sparse.values); } }
  if (keep.length) {
    json.bufferViews = keep;
    json.buffers = [{ byteLength: size, uri: 'data:application/octet-stream;base64,' + Buffer.concat(parts).toString('base64') }];
  } else { delete json.bufferViews; delete json.buffers; }
  return { json, images };
}

/** Convert every .glb under `dir` in place; returns { files, before, after } byte counts. */
export function unpackAll(dir) {
  let files = 0, before = 0, after = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!/\.glb$/i.test(e.name)) continue;
      const glb = fs.readFileSync(f), base = e.name.replace(/\.glb$/i, '');
      const { json, images } = glbToGltf(glb, base);
      const out = path.join(d, `${base}.${MODEL_EXT}`);
      fs.writeFileSync(out, JSON.stringify(json));
      after += fs.statSync(out).size;
      for (const im of images) { fs.writeFileSync(path.join(d, im.file), im.bytes); after += im.bytes.length; }
      fs.rmSync(f);
      files++; before += glb.length;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { files, before, after };
}
