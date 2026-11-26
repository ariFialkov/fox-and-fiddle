"""Retarget Meshy library clips (Mixamo-named rig on our v2 rest pose) onto the Patron v2 skeleton.

The rig was made from a character in the v2 rest pose (arms down), so source and target rest poses match and a
bone's world rotation away from rest carries straight over: target world = source world * source rest^-1 (the v2
rest is the identity). Local rotations follow from the v2 hierarchy. The hips also carry their height change
(scaled to v2's hip height) and a little sway; drift across the floor is removed so clips loop in place.

Output: public/western/anim/patron-clips.json, one entry per clip: fps, frame count, the bone list, rotations as
int16 quaternions (base64) and hips offsets.
usage: retarget.py  (reads models/west/anim/batch*.glb + clips.json)
"""
import base64, json, sys
import numpy as np
import pygltflib as G

A = '/home/claude/models/west/anim/'
OUT = '/home/claude/verify/public/western/anim/patron-clips.json'
MAP = {'Hips': 'Hips', 'Spine': 'Spine', 'Spine1': 'Spine1', 'Spine2': 'Spine2', 'Neck': 'Neck', 'Head': 'Head',
       'LeftShoulder': 'LeftShoulder', 'LeftArm': 'LeftArm', 'LeftForeArm': 'LeftForeArm', 'LeftHand': 'LeftHand',
       'RightShoulder': 'RightShoulder', 'RightArm': 'RightArm', 'RightForeArm': 'RightForeArm', 'RightHand': 'RightHand',
       'LeftUpLeg': 'LeftUpLeg', 'LeftLeg': 'LeftLeg', 'LeftFoot': 'LeftFoot', 'RightUpLeg': 'RightUpLeg', 'RightLeg': 'RightLeg', 'RightFoot': 'RightFoot'}
PARENT = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck',
          'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
          'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
          'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg'}
V2_HIPS_Y = 0.80


def qmul(a, b):
    x1, y1, z1, w1 = np.moveaxis(a, -1, 0); x2, y2, z2, w2 = np.moveaxis(b, -1, 0)
    return np.stack([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                     w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2], -1)


def qinv(q): return q * np.array([-1, -1, -1, 1.0])


def qrot(q, v):
    u = q[..., :3]; w = q[..., 3:4]
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def slerp_track(times, vals, t):
    """Sample a rotation track (linear interpolation, renormalised; dense 30 fps keys make this fine)."""
    i = np.clip(np.searchsorted(times, t) - 1, 0, len(times) - 2)
    f = np.clip((t - times[i]) / np.maximum(times[i + 1] - times[i], 1e-9), 0, 1)[:, None]
    a, b = vals[i], vals[i + 1].copy()
    b[(a * b).sum(1) < 0] *= -1
    q = a * (1 - f) + b * f
    return q / np.linalg.norm(q, axis=1, keepdims=True)


def lerp_track(times, vals, t):
    i = np.clip(np.searchsorted(times, t) - 1, 0, len(times) - 2)
    f = np.clip((t - times[i]) / np.maximum(times[i + 1] - times[i], 1e-9), 0, 1)[:, None]
    return vals[i] * (1 - f) + vals[i + 1] * f


def load(path):
    g = G.GLTF2().load(path); blob = g.binary_blob()
    NC = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}

    def acc(i):
        a = g.accessors[i]; bv = g.bufferViews[a.bufferView]
        dt = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16}[a.componentType]
        arr = np.frombuffer(blob, dt, a.count * NC[a.type], (bv.byteOffset or 0) + (a.byteOffset or 0)).reshape(a.count, NC[a.type]).astype(np.float64)
        if a.normalized: arr = arr / {np.int16: 32767.0, np.uint16: 65535.0, np.uint8: 255.0}[dt]
        return arr
    return g, acc


def retarget_file(path, names, fps=30):
    g, acc = load(path)
    nodes = g.nodes
    parent = {}
    for i, n in enumerate(nodes):
        for c in (n.children or []): parent[c] = i
    byname = {n.name: i for i, n in enumerate(nodes)}
    src = {k: byname['mixamorig:' + v] for k, v in MAP.items()}
    rest_t = {i: np.array(n.translation or [0, 0, 0], float) for i, n in enumerate(nodes)}
    rest_r = {i: np.array(n.rotation or [0, 0, 0, 1], float) for i, n in enumerate(nodes)}
    rest_s = {i: np.array(n.scale or [1, 1, 1], float) for i, n in enumerate(nodes)}

    def chain(i):
        c = [i]
        while c[-1] in parent: c.append(parent[c[-1]])
        return c[::-1]
    out = []
    for ai, anim in enumerate(g.animations):
        tracks_r, tracks_t = {}, {}
        tmax = 0
        for ch in anim.channels:
            s = anim.samplers[ch.sampler]
            tin = acc(s.input)[:, 0]; tout = acc(s.output); tmax = max(tmax, tin[-1])
            if ch.target.path == 'rotation': tracks_r[ch.target.node] = (tin, tout)
            elif ch.target.path == 'translation': tracks_t[ch.target.node] = (tin, tout)
        n_f = max(2, int(round(tmax * fps)) + 1)
        t = np.linspace(0, tmax, n_f)

        def local_r(i): return slerp_track(*tracks_r[i], t) if i in tracks_r else np.tile(rest_r[i], (n_f, 1))
        def local_t(i): return lerp_track(*tracks_t[i], t) if i in tracks_t else np.tile(rest_t[i], (n_f, 1))
        # world transforms (rotation + position) of every mapped bone, animated and at rest
        cacheA, cacheR = {}, {}

        def world(i, animated):
            cache = cacheA if animated else cacheR
            if i in cache: return cache[i]
            r = local_r(i) if animated else np.tile(rest_r[i], (n_f, 1))
            p = (local_t(i) if animated else np.tile(rest_t[i], (n_f, 1)))
            if i in parent:
                pr, pp = world(parent[i], animated)
                sc = rest_s[parent[i]]
                p = pp + qrot(pr, p * sc); r = qmul(pr, r)
            cache[i] = (r, p)
            return cache[i]
        T = {}
        for b in MAP:
            ra, _ = world(src[b], True); rr, _ = world(src[b], False)
            T[b] = qmul(ra, qinv(rr))                    # world rotation away from rest = v2 world rotation
        L = {}
        for b in MAP:
            p = PARENT[b]
            L[b] = T[b] if p is None else qmul(qinv(T[p]), T[b])
            L[b] /= np.linalg.norm(L[b], axis=1, keepdims=True)
            L[b][L[b][:, 3] < 0] *= -1
        # keep the heading: take out the hips' yaw baseline and its drift over the clip (the game decides where a
        # Patron faces); the sway around it stays
        hq = L['Hips']
        yaw = 2 * np.arctan2(hq[:, 1], hq[:, 3])                     # twist about +Y
        yaw = np.unwrap(yaw)
        trend = np.linspace(yaw[0], yaw[-1], n_f)
        corr = -trend
        cq = np.stack([np.zeros(n_f), np.sin(corr / 2), np.zeros(n_f), np.cos(corr / 2)], 1)
        L['Hips'] = qmul(cq, hq); L['Hips'][L['Hips'][:, 3] < 0] *= -1
        _, pa = world(src['Hips'], True); _, pr = world(src['Hips'], False)
        k = V2_HIPS_Y / max(pr[0, 1], 1e-6)
        d = (pa - pr) * k
        # remove travel: the linear trend in x and z (loops stay in place, sways stay)
        for ax in (0, 2):
            d[:, ax] -= np.linspace(d[0, ax], d[-1, ax], n_f)
        out.append((names[ai] if ai < len(names) else anim.name, n_f, L, d, anim.name))
    return out


# clips that turned the body round or looked wrong on the cast: fetched, but not shipped
SKIP = {'idle', 'idle2', 'swingDance', 'idle5', 'sitIdle', 'sitIdleF'}
# clips that use the character's right hand where the game puts props in the left: also shipped mirrored, as <name>M
MIRROR = {'sitDrink'}


def mirror(L, d):
    """Mirror a clip across the body's x = 0 plane: swap Left/Right bones, quaternion (x, y, z, w) -> (x, -y, -z, w)."""
    M = {}
    for b in L:
        src = b.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right')
        q = L[src].copy(); q[:, 1] *= -1; q[:, 2] *= -1; M[b] = q
    d = d.copy(); d[:, 0] *= -1
    return M, d


def pack(entries, fps=30):
    bones = list(MAP)
    clips = {}
    for name, n_f, L, d, src_name in entries:
        q = np.stack([L[b] for b in bones], 1)              # frames x bones x 4
        qi = np.clip(np.round(q * 32767), -32767, 32767).astype('<i2')
        hi = np.clip(np.round(d * 10000), -32767, 32767).astype('<i2')   # 0.1 mm
        clips[name] = {'fps': fps, 'frames': int(n_f), 'source': src_name,
                       'q': base64.b64encode(qi.tobytes()).decode(), 'hips': base64.b64encode(hi.tobytes()).decode()}
    return {'version': 1, 'bones': bones, 'quatScale': 32767, 'hipsScale': 10000, 'clips': clips}


if __name__ == '__main__':
    import os, glob
    meta = json.load(open(A + 'clips.json'))
    entries = []
    for bi, names in enumerate(meta['batches']):
        f = A + f'batch{bi}.glb'
        if os.path.exists(f):
            e = retarget_file(f, names)
            print(f, [(x[0], x[4], x[1]) for x in e])
            for name, n_f, L, d, src in e:
                if name in SKIP: continue
                entries.append((name, n_f, L, d, src))
                if name in MIRROR: entries.append((name + 'M', n_f, *mirror(L, d), src + ' (mirrored)'))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(pack(entries), open(OUT, 'w'))
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
