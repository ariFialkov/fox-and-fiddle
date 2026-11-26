"""Cut an A-posed Meshy character into the rigid parts of the game's Patron rig (src/world/Patron.js)
and fit each part into its joint's local space.

Patron rig at height 1.0 (the game scales the whole body by `height` afterwards), character faces +Z:
  hips      (+-0.11, 0.80, 0)  leg hangs below (CapsuleGeometry at y -0.4)
  torso     y 0.78             body mesh above
  arm pivot torso-local (+-0.27 male / +-0.22 female, 0.52)  -> world y 1.30
  fore      pivot-local y -0.30  -> world 1.00
  hand      fore-local  y -0.30  -> world 0.70 (hand mesh rotates about its own centre)
  neck      torso-local y 0.78   -> world 1.56 ; mouth at neck-local (0, 0.05, 0.12), scaled in x for mood

Output GLB: one mesh node per part, geometry already in that joint's local space, index 0 = the x<0 side
(Patron's hips[0] / arms[0]):  leg_0 leg_1 torso upperArm_0 upperArm_1 forearm_0 forearm_1 hand_0 hand_1 head mouth
(mouth node keeps its translation; its geometry is centred so scale.x works as in the game).

usage: west_char_rig.py name female(0/1) [overrides json]
"""
import sys, os, io, json, math
import numpy as np
import trimesh
from PIL import Image
from trimesh.visual.material import PBRMaterial

D = '/home/claude/models/west/chars/'
name, female = sys.argv[1], sys.argv[2] == '1'
OV = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

RIG = dict(hipX=0.11, hipY=0.80, torsoY=0.78, shX=0.22 if female else 0.27, shY=1.30, elY=1.00, handY=0.70, neckY=1.56)

# ---------- load, merge, normalise (feet on y=0, centred, unit height) ----------
sc = trimesh.load(D + 'raw3d/' + name + '.glb')
geoms = []
for node in sc.graph.nodes_geometry:
    T, g = sc.graph[node]
    m = sc.geometry[g].copy(); m.apply_transform(T); geoms.append(m)
mesh = geoms[0] if len(geoms) == 1 else trimesh.util.concatenate(geoms)
mat = mesh.visual.material
uv = mesh.visual.uv.copy()
V = mesh.vertices.copy()
H0 = np.ptp(V[:, 1])
V[:, 1] -= V[:, 1].min()
V /= H0
mesh = trimesh.Trimesh(V, mesh.faces.copy(), process=False)
pts, fidx = trimesh.sample.sample_surface(mesh, 300000, seed=1)
cx = np.median(pts[pts[:, 1] < 0.5, 0]); cz = np.median(pts[:, 2])
V[:, 0] -= cx; V[:, 2] -= cz; pts[:, 0] -= cx; pts[:, 2] -= cz
mesh = trimesh.Trimesh(V, mesh.faces, process=False)
topo = mesh.copy(); topo.merge_vertices(merge_tex=True, merge_norm=True)
assert len(topo.faces) == len(mesh.faces)
tid = np.zeros(len(V), int)                       # original vertex -> position-merged vertex
tid[mesh.faces.ravel()] = topo.faces.ravel()
_e = np.sort(topo.edges, axis=1); _u, _c = np.unique(_e, axis=0, return_counts=True)
RAW_OPEN = set(map(tuple, _u[_c == 1]))            # edges already open in the scan (hair cards, brims): never capped

# ---------- landmarks ----------
bins = np.linspace(0, 1, 201)


def slab(y0, y1, P=pts):
    return P[(P[:, 1] >= y0) & (P[:, 1] < y1)]


def clusters(xs, gap=0.012):
    xs = np.sort(xs)
    cuts = np.where(np.diff(xs) > gap)[0]
    return np.split(xs, cuts + 1)


# hands: outermost points on each side
tips = {}
for s in (-1, 1):
    side = pts[pts[:, 0] * s > 0]
    i = np.argmax(side[:, 0] * s)
    tips[s] = side[i]
yt = min(tips[-1][1], tips[1][1])

# neck base: going up from the chest, the first slice that is much narrower than the shoulders
widths = []
for y in np.arange(0.70, 0.95, 0.005):
    sl = slab(y, y + 0.01); sl = sl[np.abs(sl[:, 0]) < 0.12]
    widths.append((y, np.percentile(np.abs(sl[:, 0]), 97) if len(sl) > 20 else 0.0))
wsh = np.median([w for y, w in widths if y < 0.76])
neckY = next((y for y, w in widths if y > 0.74 and w < 0.65 * wsh), 0.83)
neckY = OV.get('neck', neckY)
neckW = min(w for y, w in widths if abs(y - neckY) < 0.03)

# shoulder top: first slice below the neck that is much wider than the neck
shTop = None
for y in np.arange(neckY - 0.005, neckY - 0.15, -0.005):
    sl = slab(y, y + 0.01)
    w = np.percentile(np.abs(sl[:, 0]), 99)
    if w > 2.6 * neckW:
        shTop = y
        break
shTop = OV.get('shTop', shTop if shTop is not None else neckY - 0.06)

# arm axes: outer clusters in slices between hand tips and armpits
arm = {-1: [], 1: []}
outer = {-1: {}, 1: {}}
pit = [0.0, {}]
for y in np.arange(yt - 0.03, neckY - 0.12, 0.005):
    sl = slab(y, y + 0.005)
    if len(sl) < 20:
        continue
    cl = clusters(sl[:, 0])
    if len(cl) >= 3:
        mid = [k for k, c in enumerate(cl) if c.min() <= 0.0 <= c.max()]
        if not mid:
            continue
        m = mid[0]
        pit[0] = max(pit[0], y); pit[1][round(y, 4)] = max(-cl[m].min(), cl[m].max())
        if m > 0: outer[-1][round(y, 4)] = (cl[0].min(), cl[m - 1].max())
        if m < len(cl) - 1: outer[1][round(y, 4)] = (cl[m + 1].min(), cl[-1].max())
for y in np.arange(yt + 0.03, shTop - 0.09, 0.005):
    sl = slab(y, y + 0.005)
    cl = clusters(sl[:, 0])
    if len(cl) >= 3:
        for s, c in ((-1, cl[0]), (1, cl[-1])):
            sel = sl[(sl[:, 0] >= c.min()) & (sl[:, 0] <= c.max())]
            arm[s].append(sel.mean(0))
pitY = pit[0]
wPit = np.median([w for y_, w in pit[1].items() if y_ > pitY - 0.04]) if pit[1] else 0.1
print(f'  armpit {pitY:.3f} body half-width there {wPit:.3f}')
J = {}
for s in (-1, 1):
    A = np.array(arm[s])
    c = A.mean(0); u = np.linalg.svd(A - c)[2][0]
    if u[1] > 0:
        u = -u  # pointing down the arm
    # shoulder joint: on the arm axis, a fixed drop below the neck (the slope of A-posed shoulders hides it);
    # depth = middle of the body at that height (the axis itself drifts forward/back when extrapolated)
    shY = neckY - OV.get('shDrop', 0.045)
    sh = c + ((shY - c[1]) / u[1]) * u
    band = pts[(np.abs(pts[:, 1] - shY) < 0.01) & (np.abs(pts[:, 0]) < abs(sh[0]))]
    sh[2] = np.median(band[:, 2]) if len(band) else 0.0
    sh[0] = s * max(abs(sh[0]), wPit - 0.01)       # never inside the chest
    tip = tips[s]
    L = np.linalg.norm(tip - sh); u = (tip - sh) / L
    J[s] = dict(sh=sh, el=sh + u * L * 0.42, wr=sh + u * L * 0.76, hc=sh + u * L * 0.86, tip=tip, u=u)
    if 'sh' in OV:
        J[s]['sh'][0] = s * OV['sh'][0]; J[s]['sh'][1] = OV['sh'][1]

# crotch: lowest slice where there is surface on the centre line (front-to-back)
crotch = None
for y in np.arange(0.25, 0.62, 0.005):
    sl = slab(y, y + 0.01)
    if (np.abs(sl[:, 0]) < 0.008).sum() > 6:
        crotch = y
        break
skirt = OV.get('skirt', crotch is None)
crotchY = OV.get('crotch', 0.40 if skirt else crotch)
hemY = crotch if (skirt and crotch is not None) else crotchY  # where separate legs begin
print(f"{name}: neck {neckY:.3f} shoulderTop {shTop:.3f} crotch {crotchY:.3f} hem {hemY:.3f} skirt {skirt}")
for s in (-1, 1):
    print('  arm', s, {k: np.round(v, 3).tolist() for k, v in J[s].items() if k != 'u'})

# ---------- assign faces ----------
C = mesh.triangles_center
part = np.full(len(C), 'torso', dtype=object)


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t


for s in (-1, 1):
    j = J[s]
    d1, _ = seg_dist(C, j['sh'], j['el']); d2, _ = seg_dist(C, j['el'], j['wr']); d3, _ = seg_dist(C, j['wr'], j['tip'])
    d = np.minimum(np.minimum(d1, d2), d3)
    # near the shoulder: distance to the arm line; lower down, where the arm hangs free of the body,
    # anything in the outer cluster of its horizontal slice belongs to the arm
    # above the armpit: the arm side of a cut plane through the shoulder joint, outboard of the chest
    plane = (C - j['sh']) @ j['u'] > OV.get('cut', -0.005)
    isarm = plane & (C[:, 1] >= pitY) & (C[:, 0] * s > wPit * 0.95) & (d1 < 0.08) & (C[:, 1] < j['sh'][1] + OV.get('capH', 0.02))
    # below the armpit the arm hangs free: whatever lies outboard of the body in its slice
    for yb, (lo, hi) in outer[s].items():
        sel = (C[:, 1] >= yb) & (C[:, 1] < yb + 0.005) & (C[:, 0] >= lo - 0.004) & (C[:, 0] <= hi + 0.004)
        isarm |= sel
    k = np.argmin(np.stack([d1, d2, d3]), 0)
    idx = 0 if s < 0 else 1
    part[isarm & (k == 0)] = f'upperArm_{idx}'
    part[isarm & (k == 1)] = f'forearm_{idx}'
    part[isarm & (k == 2)] = f'hand_{idx}'
notarm = np.array([not p.startswith(('upperArm', 'forearm', 'hand')) for p in part])
part[notarm & (C[:, 1] > neckY)] = 'head'
legs = notarm & (C[:, 1] < hemY)
part[legs & (C[:, 0] < 0)] = 'leg_0'
part[legs & (C[:, 0] >= 0)] = 'leg_1'

if OV.get('debug'):
    for p_ in ('upperArm_0', 'forearm_0'):
        cc = C[part == p_]
        print('  ', p_, len(cc), 'x', np.round(np.percentile(cc[:, 0], [0, 10, 50, 90, 100]), 3), 'y', np.round(np.percentile(cc[:, 1], [0, 50, 100]), 3))
    print('  sh', np.round(J[-1]['sh'], 3), 'el', np.round(J[-1]['el'], 3), 'tip', np.round(J[-1]['tip'], 3))
    w = (part == 'torso') & (np.abs(C[:, 0]) > 0.11) & (C[:, 1] < neckY - 0.12)
    print('  wide torso faces', w.sum(), np.round(C[w][np.argsort(C[w][:, 1])][::max(1, w.sum() // 12)], 3).tolist())
# ---------- fit each part into its joint space ----------
shY_m = (J[-1]['sh'][1] + J[1]['sh'][1]) / 2      # model shoulder-joint height
S = RIG['shY'] / shY_m                              # global scale (model units -> metres) for widths, head, hands
CROTCH_W = OV.get('crotchW', 0.72)                  # crotch sits a little below the hip pivot (0.80), like a real hip joint
sy_leg = CROTCH_W / crotchY
sy_t = (RIG['shY'] - CROTCH_W) / (shY_m - crotchY)
headBase = RIG['shY'] + (neckY - shY_m) * S         # where the model's neck lands (the head hangs from the 1.56 pivot)


def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1 / (1 + c))


out = {}
# tidy the labels: a part must be one piece. Small islands go to the neighbouring part they touch most.
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
A = topo.face_adjacency
for _ in range(4):
    changed = 0
    same = part[A[:, 0]] == part[A[:, 1]]
    G = coo_matrix((np.ones(same.sum()), (A[same, 0], A[same, 1])), shape=(len(part), len(part)))
    ncomp, comp = connected_components(G, directed=False)
    sizes = np.bincount(comp)
    for pname in set(part):
        cids = np.unique(comp[part == pname])
        if len(cids) < 2:
            continue
        keep = cids[np.argmax(sizes[cids])]
        for cid in cids:
            if cid == keep:
                continue
            fs = np.where(comp == cid)[0]
            if len(fs) > OV.get('island', 40):      # a real piece of clothing (Meshy builds clothes as separate shells): leave it
                continue
            fset = set(fs.tolist())
            border = [b if a in fset else a for a, b in A[np.isin(A[:, 0], fs) ^ np.isin(A[:, 1], fs)]]
            labs = [part[f] for f in border if part[f] != pname]
            if not labs and pname.startswith(('upperArm', 'forearm', 'hand')):
                s_ = -1 if pname.endswith('_0') else 1
                c_ = C[fs].mean(0)
                dmin = min(seg_dist(c_[None], J[s_][a_], J[s_][b_])[0][0] for a_, b_ in (('sh', 'el'), ('el', 'wr'), ('wr', 'tip')))
                if dmin > OV.get('strayArm', 0.04):
                    labs = ['torso' if c_[1] >= hemY else ('leg_0' if c_[0] < 0 else 'leg_1')]
            if labs:
                part[fs] = max(set(labs), key=labs.count); changed += 1
    if not changed:
        break
faces_of = {p: np.where(part == p)[0] for p in set(part)}
# grow every part a couple of face rings past its cut so rotating joints don't open gaps
adj = topo.face_adjacency
nbr = [[] for _ in range(len(mesh.faces))]
for a, b in adj:
    nbr[a].append(b); nbr[b].append(a)
RINGS = OV.get('rings', 2)
for p in list(faces_of):
    if p == 'head':
        continue
    cur = set(faces_of[p].tolist())
    front = set(cur)
    for _ in range(RINGS):
        nxt = set()
        for f in front:
            nxt.update(nbr[f])
        nxt -= cur
        # never grow arms into legs / legs into arms
        nxt = {f for f in nxt if not ((p.startswith('leg') and part[f].startswith(('upperArm', 'forearm', 'hand'))) or
                                      (p.startswith(('upperArm', 'forearm', 'hand')) and part[f].startswith(('leg', 'torso'))) or
                                      (p == 'torso' and part[f].startswith(('upperArm', 'forearm', 'hand'))))}
        cur |= nxt; front = nxt
    faces_of[p] = np.array(sorted(cur))


USED = {}


def sub(p):
    f = faces_of.get(p, np.array([], int))
    m = trimesh.Trimesh(mesh.vertices, mesh.faces[f], process=False)
    used = np.unique(mesh.faces[f]); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
    USED[p] = used
    return mesh.vertices[used].copy(), remap[mesh.faces[f]], uv[used].copy()


# ---------- one continuous deformation of the whole scan, then cut ----------
# Lowering the arms and fitting the rig proportions happen on the intact mesh with smooth weights,
# so shoulders, elbows and hips bend like skin instead of tearing; the parts are cut afterwards
# and therefore meet exactly in the rest pose.
NV = len(topo.vertices)
tf = topo.faces
TE = topo.edges_unique
deg = np.bincount(TE.ravel(), minlength=NV).astype(float)


def vert_indicator(labels):
    """fraction of each merged vertex's faces whose (pre-growth) label is in `labels`"""
    hit = np.isin(part, labels).astype(float)
    acc = np.zeros(NV); cnt = np.zeros(NV)
    for k in range(3):
        np.add.at(acc, tf[:, k], hit); np.add.at(cnt, tf[:, k], 1)
    return acc / np.maximum(cnt, 1)


def smooth(w, it):
    for _ in range(it):
        nb = np.zeros(NV); np.add.at(nb, TE[:, 0], w[TE[:, 1]]); np.add.at(nb, TE[:, 1], w[TE[:, 0]])
        w = 0.5 * w + 0.5 * nb / np.maximum(deg, 1)
    return w


def axis_angle(R):
    ang = math.acos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if ang < 1e-6:
        return np.array([1.0, 0, 0]), 0.0
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]); ax /= np.linalg.norm(ax)
    return ax, ang


def rot_partial(P, centre, ax, ang, w):
    """rotate each point about `centre` by ang*w (Rodrigues, per point)"""
    q = P - centre; t = ang * w
    c, s_ = np.cos(t)[:, None], np.sin(t)[:, None]
    return centre + q * c + np.cross(ax, q) * s_ + ax * (q @ ax)[:, None] * (1 - c)


TV = topo.vertices.copy()
SM = OV.get('smooth', 6)
W = {}
for s in (-1, 1):
    i_ = 0 if s < 0 else 1
    W[('arm', s)] = smooth(vert_indicator([f'upperArm_{i_}', f'forearm_{i_}', f'hand_{i_}']), SM)
    W[('fore', s)] = smooth(vert_indicator([f'forearm_{i_}', f'hand_{i_}']), SM)
    W[('leg', s)] = smooth(vert_indicator([f'leg_{i_}']), SM)

down = np.array([0, -1.0, 0])
PZ = TV.copy()
ARM = {}
for s in (-1, 1):
    j = J[s]
    R1 = rot_to(j['el'] - j['sh'], down)
    el1 = j['sh'] + R1 @ (j['el'] - j['sh']); wr1 = j['sh'] + R1 @ (j['wr'] - j['sh'])
    R2 = rot_to(wr1 - el1, down)
    ax1, a1 = axis_angle(R1); ax2, a2 = axis_angle(R2)
    PZ = rot_partial(PZ, j['sh'], ax1, a1, W[('arm', s)])
    PZ = rot_partial(PZ, el1, ax2, a2, W[('fore', s)])
    lu = np.linalg.norm(j['el'] - j['sh']); lf = np.linalg.norm(j['wr'] - j['el']); lh = np.linalg.norm(j['hc'] - j['wr'])
    ARM[s] = dict(sh=j['sh'], el_y=j['sh'][1] - lu, wr_y=j['sh'][1] - lu - lf, lh=lh)

# torso / leg / head mapping (one function of height, so legs, torso and head agree where they meet)
y = PZ[:, 1]
Yb = np.where(y < crotchY, y * sy_leg,
              np.where(y < shY_m, CROTCH_W + (y - crotchY) * sy_t, RIG['shY'] + (y - shY_m) * S))
Xb = PZ[:, 0] * S
Zb = PZ[:, 2] * S
wl = W[('leg', -1)] + W[('leg', 1)]
wa = W[('arm', -1)] + W[('arm', 1)]
body = (wl < 0.5) & (wa < 0.5)
waist = body & (Yb > RIG['hipY'] + 0.06) & (Yb < RIG['shY'] - 0.2)
lim = RIG['shX'] - 0.055
wmax = np.percentile(np.abs(Xb[waist]), 98) if waist.any() else lim
sx_t = min(1.0, max(OV.get('minSqueeze', 0.85), lim / wmax))
Xt = Xb * sx_t
shx_w = abs(J[1]['sh'][0]) * S * sx_t
ARMX = float(np.clip(abs(J[1]['sh'][0]) * S * OV.get('armSpread', 1.2), RIG['shX'] - OV.get('armIn', 0.06), RIG['shX']))
k = max(1.0, (ARMX - OV.get('shGap', 0.035)) / max(shx_w, 1e-3))
pit_w = CROTCH_W + (pitY - crotchY) * sy_t
tt = np.clip((Yb - pit_w) / max(RIG['shY'] - pit_w, 1e-3), 0, 1); tt = tt * tt * (3 - 2 * tt)
nw = neckW * S
axb = np.abs(Xt)
up = np.clip((Yb - RIG['shY']) / max(headBase - RIG['shY'], 1e-3), 0, 1); up = up * up * (3 - 2 * up)
tt = tt * (1 - 0.85 * up)
Xt = np.where(axb > nw, np.sign(Xt) * (nw + (axb - nw) * (1 + (k - 1) * tt)), Xt)
OUTP = np.c_[Xt, Yb, Zb]
print(f'  arms hang at x={ARMX:.3f} (pivot {RIG["shX"]}), shoulder widening x{k:.2f}')
print(f'  scale S={S:.3f} legs sy={sy_leg:.3f} head drop={headBase - RIG["neckY"]:.3f} torso sy={sy_t:.3f} torso x-squeeze={sx_t:.3f}')

# legs: centred under their hip pivots
for s in (-1, 1):
    w = W[('leg', s)][:, None]
    sel = (PZ[:, 0] * s > 0) & (PZ[:, 1] > 0.15) & (PZ[:, 1] < 0.3)
    lx = np.median(PZ[sel, 0]) if sel.any() else s * 0.06
    L = np.c_[s * RIG['hipX'] + (PZ[:, 0] - lx) * S, Yb, Zb]
    OUTP = OUTP * (1 - w) + L * w

# arms: hanging straight under their pivots, shoulder 1.30 -> elbow 1.00 -> hand centre 0.70
for s in (-1, 1):
    a = ARM[s]; w = W[('arm', s)][:, None]
    yy = PZ[:, 1]
    hand_c = a['wr_y'] - a['lh']
    Ya = np.where(yy > a['el_y'], RIG['shY'] - (a['sh'][1] - yy) * (RIG['shY'] - RIG['elY']) / (a['sh'][1] - a['el_y']),
         np.where(yy > hand_c, RIG['elY'] - (a['el_y'] - yy) * (RIG['elY'] - RIG['handY']) / (a['el_y'] - hand_c),
                  RIG['handY'] - (hand_c - yy) * S))
    Ya = np.where(yy > a['sh'][1], RIG['shY'] + (yy - a['sh'][1]) * S, Ya)
    # natural shoulder width at the top, exactly on the rig's elbow / hand joints from the elbow down (props hang there)
    t_ = np.clip((RIG['shY'] - Ya) / (RIG['shY'] - RIG['elY']), 0, 1)
    ax_ = ARMX + (RIG['shX'] - ARMX) * t_
    A = np.c_[s * ax_ + (PZ[:, 0] - a['sh'][0]) * S, Ya, (PZ[:, 2] - a['sh'][2]) * S]
    OUTP = OUTP * (1 - w) + A * w

# ---------- level the head: many scans look slightly upward ----------
sys.path.insert(0, '/home/claude/scripts')
from face_probe import front_raster
tex2k = np.asarray((mat.baseColorTexture if getattr(mat, 'baseColorTexture', None) is not None else mat.image).convert('RGB')).astype(float) / 255
hf = faces_of.get('head', np.array([], int))
HV = OUTP[tid] - np.array([0, RIG['neckY'], 0])
RES = 0.0015; X0, X1, Y0, Y1 = -0.045, 0.045, -0.32, 0.3
rowy = lambda r: Y1 - (r + 0.5) * RES
yb = headBase - RIG['neckY']


def face_scan():
    col_, dep_ = front_raster(HV, mesh.faces[hf], uv, tex2k, X0, X1, Y0, Y1, RES)
    sk_ = (col_[..., 0] > col_[..., 2] + 0.06) & (col_[..., 0] > 0.30)
    return col_, dep_, sk_


colf, depf, skin = face_scan()
cc = slice(colf.shape[1] // 2 - 4, colf.shape[1] // 2 + 4)
dcen = depf[:, cc].max(1)
cand = np.where((skin[:, cc].mean(1) > 0.5) & (dcen > -1e8))[0]
face_rows = cand[(rowy(cand) > yb + 0.09) & (rowy(cand) < yb + 0.19)]
r_nose = face_rows[np.argmax(dcen[face_rows])] if len(face_rows) else (cand[len(cand) // 2] if len(cand) else int((Y1 - yb - 0.13) / RES))


def band_depth(r0, r1, cols=slice(None)):
    r0, r1 = max(0, r0), min(depf.shape[0] - 1, r1)
    d = depf[r0:r1, cols]; m = skin[r0:r1, cols] & (d > -1e8)
    return (float(np.median(d[m])), float(np.mean([rowy(r) for r in range(r0, r1)]))) if m.sum() > 6 else (None, None)


# face slope: fit depth against height over the bare-skin face (brow to chin), central columns, nose band excluded
rows = np.arange(max(0, r_nose - int(0.07 / RES)), min(depf.shape[0], r_nose + int(0.07 / RES)))
cols = slice(colf.shape[1] // 2 - 14, colf.shape[1] // 2 + 14)
ys_, zs_ = [], []
for r in rows:
    if abs(r - r_nose) < int(0.012 / RES):
        continue
    d = depf[r, cols]; m = skin[r, cols] & (d > -1e8)
    if m.sum() > 6:
        ys_.append(rowy(r)); zs_.append(np.percentile(d[m], 80))
pitch = 0.0
if len(ys_) > 15:
    slope = np.polyfit(ys_, zs_, 1)[0]            # dz/dy ; a face looking up leans back: negative
    print(f'  raw face lean {math.degrees(math.atan(-slope)):.1f} deg from {len(ys_)} rows')
    pitch = float(np.clip(math.atan(-slope) - OV.get('pitchBase', 0.12), 0.0, 0.4))
pitch = OV.get('pitch', pitch)
if pitch > 0.01:
    hw = smooth(vert_indicator(['head']), SM)
    piv = np.array([0, headBase, float(np.median(OUTP[np.abs(OUTP[:, 1] - headBase) < 0.02, 2])) if (np.abs(OUTP[:, 1] - headBase) < 0.02).any() else 0.0])
    OUTP = rot_partial(OUTP, piv, np.array([1.0, 0, 0]), pitch, hw)
print(f'  head pitch correction {math.degrees(pitch):.1f} deg')

_body = trimesh.Trimesh(OUTP, tf, process=False)
VN = _body.vertex_normals.copy()                   # smooth across UV seams and part cuts
NORM = {}
JOINT = {'leg_0': (-RIG['hipX'], RIG['hipY'], 0), 'leg_1': (RIG['hipX'], RIG['hipY'], 0), 'torso': (0, RIG['torsoY'], 0),
         'upperArm_0': (-RIG['shX'], RIG['shY'], 0), 'upperArm_1': (RIG['shX'], RIG['shY'], 0),
         'forearm_0': (-RIG['shX'], RIG['elY'], 0), 'forearm_1': (RIG['shX'], RIG['elY'], 0),
         'hand_0': (-RIG['shX'], RIG['handY'], 0), 'hand_1': (RIG['shX'], RIG['handY'], 0), 'head': (0, RIG['neckY'], 0)}
for pname in JOINT:
    f = faces_of.get(pname, np.array([], int))
    used = np.unique(mesh.faces[f]); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
    USED[pname] = used
    out[pname] = (OUTP[tid[used]] - np.array(JOINT[pname]), remap[mesh.faces[f]], uv[used].copy())
    NORM[pname] = VN[tid[used]]

# mouth: on the face front at neck-local y 0.05 (or override)
# ---------- close every cut: fan-fill each open loop the cutting made ----------
def cap_cuts(p, L, F, U):
    t = tid[USED[p]]                                   # local vertex -> merged id
    first = {}
    for i, k in enumerate(t):
        first.setdefault(k, i)
    E = np.sort(np.c_[t[F[:, [0, 1]]], t[F[:, [1, 2]]], t[F[:, [2, 0]]]].reshape(-1, 2), axis=1)
    u, c = np.unique(E, axis=0, return_counts=True)
    cut = [tuple(e) for e in u[c == 1] if tuple(e) not in RAW_OPEN]
    if OV.get('debug') and p == 'head':
        ob = u[c == 1]; ys = topo.vertices[ob[:, 0], 1]
        print('    head open-edge heights', np.round(np.percentile(ys, [0, 25, 50, 75, 100]), 3), 'neck', round(neckY, 3), 'raw-open total', len(RAW_OPEN))
    if OV.get('debug'): print('   ', p, 'open edges', int((c == 1).sum()), 'cut edges', len(cut), 'odd', int((c > 2).sum()))
    nb = {}
    for a, b in cut:
        nb.setdefault(a, []).append(b); nb.setdefault(b, []).append(a)
    seen, loops = set(), []
    for start in list(nb):
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [x for x in nb[cur] if x != prev and x not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]; seen.add(cur); loop.append(cur)
        if len(loop) >= 3:
            loops.append(loop)
    NL, NF, NU = [L], [F], [U]
    n0 = len(L); added = 0
    for loop in loops:
        idx = [first[k] for k in loop]
        pts = L[idx]
        ctr = pts.mean(0)
        uv = U[idx[len(idx) // 2]]
        base = n0 + added
        NL.append(np.r_[pts, ctr[None]]); NU.append(np.repeat(uv[None], len(idx) + 1, 0))
        nrm = NORM[p][idx].mean(0); nrm = nrm / (np.linalg.norm(nrm) + 1e-9)
        NORM[p] = np.r_[NORM[p], np.repeat(nrm[None], len(idx) + 1, 0)]
        m = len(idx)
        NF.append(np.array([[base + i, base + (i + 1) % m, base + m] for i in range(m)]))
        added += m + 1
    return np.concatenate(NL), np.concatenate(NF), np.concatenate(NU), len(loops)


# ---------- texture: 1K JPEG, matte ----------
img = mat.baseColorTexture if getattr(mat, 'baseColorTexture', None) is not None else mat.image
img = img.convert('RGB').resize((1024, 1024), Image.LANCZOS)
buf = io.BytesIO(); img.save(buf, 'JPEG', quality=88); img = Image.open(io.BytesIO(buf.getvalue()))
M = PBRMaterial(name=name, baseColorTexture=img, metallicFactor=0.0, roughnessFactor=0.85, doubleSided=True)
# mood mouth: find the painted lip line on the face and sit the mouth exactly on it
sys.path.insert(0, '/home/claude/scripts')
from face_probe import front_raster
tex2k = np.asarray((mat.baseColorTexture if getattr(mat, 'baseColorTexture', None) is not None else mat.image).convert('RGB')).astype(float) / 255
Hd, Fh, Uh = out['head']
RES = 0.0015; X0, X1, Y0, Y1 = -0.045, 0.045, -0.32, 0.3
colf, depf, uvf = front_raster(Hd, Fh, Uh, tex2k, X0, X1, Y0, Y1, RES, want_uv=True)
Image.fromarray((np.clip(colf, 0, 1) * 255).astype(np.uint8)).save(D + 'parts/' + name + '_probe.png')   # clean, for landmark finding
json.dump({'RES': RES, 'X0': X0, 'Y1': Y1}, open(D + 'parts/' + name + '_probe.json', 'w'))
Hh = colf.shape[0]
rowy = lambda r: Y1 - (r + 0.5) * RES
cc = slice(colf.shape[1] // 2 - 4, colf.shape[1] // 2 + 4)
skin = ((colf[..., 0] > colf[..., 2] + 0.06) & (colf[..., 0] > 0.30)).astype(float)
skin_rows = skin[:, cc].mean(1) > 0.5
dcen = depf[:, cc].max(1)
cand = np.where(skin_rows & (dcen > -1e8))[0]
if 'mouthY' in OV:
    my = OV['mouthY']
    r_m = int((Y1 - my) / RES)
elif len(cand):
    # nose tip = the most forward skin row in the upper-middle of the face; the lip line = darkest row below it
    yb = headBase - RIG['neckY']                         # where the neck base sits in neck-local space
    face_rows = cand[(rowy(cand) > yb + 0.09) & (rowy(cand) < yb + 0.19)]
    r_nose = face_rows[np.argmax(dcen[face_rows])] if len(face_rows) else cand[len(cand) // 2]
    if 'noseY' in OV: r_nose = int((Y1 - OV['noseY']) / RES)
    lum = colf[:, cc].mean(1) @ np.array([0.3, 0.55, 0.15])
    r_exp = r_nose + int(0.035 / RES)                      # typical nose-tip to lip-line distance
    lo, hi = r_exp - int(0.007 / RES), min(Hh - 1, r_exp + int(0.007 / RES))
    seg = np.convolve(lum[lo:hi + 1], np.ones(3) / 3, mode='same')
    r_m = lo + int(np.argmin(seg))
    my = rowy(r_m)
else:
    r_m = int((Y1 - 0.0) / RES); my = 0.0
if 'mouthDY' in OV:                                       # hand correction, measured on the face probe
    my += OV['mouthDY']; r_m = int((Y1 - my) / RES)
mz = (dcen[r_m] if dcen[r_m] > -1e8 else 0.1) - 0.0012
# centre the mouth under the nose tip (some faces are turned a little)
try:
    nose_row = depf[r_nose]; mcx = X0 + (int(np.argmax(np.where(nose_row > -1e8, nose_row, -1e9))) + 0.5) * RES
    mcx = float(np.clip(mcx, -0.012, 0.012))
except NameError:
    mcx = 0.0
if 'mouthDX' in OV: mcx += OV['mouthDX']
def depth_at(y_, x_):
    r_ = int(np.clip((Y1 - y_) / RES, 0, depf.shape[0] - 1)); c_ = int(np.clip((x_ - X0) / RES, 0, depf.shape[1] - 1))
    d_ = depf[r_, max(0, c_ - 1):c_ + 2]; d_ = d_[d_ > -1e8]
    return float(d_.max()) if len(d_) else mz
lipc = colf[max(0, r_m - 1):r_m + 2, cc].reshape(-1, 3).mean(0) * OV.get('mouthShade', 0.8)
lip = (np.clip(lipc, 0, 1) ** 2.2).tolist()  # texture is sRGB, baseColorFactor is linear
img_dbg = (np.clip(colf, 0, 1) * 255).astype(np.uint8); img_dbg[r_m, :, :] = [0, 255, 0]
try: img_dbg[r_nose, ::3, :] = [0, 255, 255]
except NameError: pass
Image.fromarray(img_dbg).resize((img_dbg.shape[1] * 4, img_dbg.shape[0] * 4), Image.NEAREST).save(D + 'parts/' + name + '_face.png')
print(f'  mouth at neck-local y {my:.3f}, z {mz:.3f}')
mouthM = PBRMaterial(name='mouth', baseColorFactor=lip + [1], roughnessFactor=0.6, metallicFactor=0, doubleSided=True)

# ---------- one skinned mesh, weighted to Patron's own joints ----------
order = ['leg_0', 'leg_1', 'torso', 'upperArm_0', 'upperArm_1', 'forearm_0', 'forearm_1', 'hand_0', 'hand_1', 'head']
JOINTS = ['torso', 'hip_0', 'hip_1', 'pivot_0', 'fore_0', 'hand_0', 'pivot_1', 'fore_1', 'hand_1', 'neck']
SMW = OV.get('skinSmooth', 7)
wts = np.zeros((NV, len(JOINTS)))
SH, EL, HP, NK = OV.get('smShoulder', 7), OV.get('smElbow', 2), OV.get('smHip', 5), OV.get('smNeck', 4)
wts[:, 1] = smooth(vert_indicator(['leg_0']), HP); wts[:, 2] = smooth(vert_indicator(['leg_1']), HP)
for k_, i_ in ((3, 0), (6, 1)):
    arm_all = smooth(vert_indicator([f'upperArm_{i_}', f'forearm_{i_}', f'hand_{i_}']), SH)
    fh = smooth(vert_indicator([f'forearm_{i_}', f'hand_{i_}']), EL)
    hd_ = smooth(vert_indicator([f'hand_{i_}']), EL)
    wts[:, k_] = arm_all * (1 - fh)
    wts[:, k_ + 1] = arm_all * fh * (1 - hd_)
    wts[:, k_ + 2] = arm_all * fh * hd_
wts[:, 9] = smooth(vert_indicator(['head']), NK)
wts[:, 0] = np.clip(1 - wts[:, 1:].sum(1), 0, None)
wts /= wts.sum(1, keepdims=True)

WJ = {'torso': (0, RIG['torsoY'], 0), 'hip_0': (-RIG['hipX'], RIG['hipY'], 0), 'hip_1': (RIG['hipX'], RIG['hipY'], 0),
      'pivot_0': (-RIG['shX'], RIG['shY'], 0), 'fore_0': (-RIG['shX'], RIG['elY'], 0), 'hand_0': (-RIG['shX'], RIG['handY'], 0),
      'pivot_1': (RIG['shX'], RIG['shY'], 0), 'fore_1': (RIG['shX'], RIG['elY'], 0), 'hand_1': (RIG['shX'], RIG['handY'], 0),
      'neck': (0, RIG['neckY'], 0)}
PARENT = {'torso': 'body', 'hip_0': 'body', 'hip_1': 'body', 'pivot_0': 'torso', 'fore_0': 'pivot_0', 'hand_0': 'fore_0',
          'pivot_1': 'torso', 'fore_1': 'pivot_1', 'hand_1': 'fore_1', 'neck': 'torso'}

# per original vertex (UV seams keep their duplicates)
from refine import refine
POSd = OUTP[tid].astype(np.float64); UVd = uv.astype(np.float64); WF = wts[tid].astype(np.float64)
if os.environ.get('RIGV2'):
    # v2 also carries the hard (unsmoothed) arm labels through the refinement, to find hands fused to the body
    _ha = vert_indicator(['upperArm_0', 'forearm_0', 'hand_0', 'upperArm_1', 'forearm_1', 'hand_1'])
    WF = np.c_[WF, _ha[tid]]
IDXd = mesh.faces.copy()

# elbows: finer triangles around each elbow, then an elbow shaped by position (tight crease in front,
# a point at the back), so a bent arm folds like an arm instead of curving like a hose
ELB = OV.get('elbowRefine', 2)
for s in (-1, 1):
    pv, fo, ha = (3, 4, 5) if s < 0 else (6, 7, 8)
    for it in range(ELB):
        arm_v = WF[:, pv] + WF[:, fo] + WF[:, ha]
        cen = POSd[IDXd].mean(1)
        sel = ((arm_v[IDXd].min(1) > 0.6) & (np.abs(cen[:, 1] - RIG['elY']) < (0.06, 0.035)[min(it, 1)])
               & (np.abs(cen[:, 0] - s * RIG['shX']) < 0.08) & (np.abs(cen[:, 2]) < 0.09))
        POSd, IDXd, (UVd, WF) = refine(POSd, IDXd, [UVd, WF], sel)
    arm_v = WF[:, pv] + WF[:, fo] + WF[:, ha]
    Y, Z = POSd[:, 1], POSd[:, 2]
    back = np.clip(-Z / 0.045, 0, 1)                       # Patron's elbows fold forward (+Z)
    hinge = RIG['elY'] - OV.get('elbowBack', 0.022) * back
    band = 0.012 + 0.018 * back
    tf = np.clip((hinge + band / 2 - Y) / band, 0, 1); tf = tf * tf * (3 - 2 * tf)
    wristY = RIG['handY'] + ARM[s]['lh'] * S
    th = np.clip((wristY + 0.012 - Y) / 0.024, 0, 1); th = th * th * (3 - 2 * th)
    on = arm_v > 1e-4
    WF[on, pv] = arm_v[on] * (1 - tf[on])
    WF[on, fo] = arm_v[on] * tf[on] * (1 - th[on])
    WF[on, ha] = arm_v[on] * tf[on] * th[on]
print(f'  elbow refinement: {len(mesh.faces)} -> {len(IDXd)} triangles')

# ---------- Patron v2 standard skeleton (RIGV2=1): knees, three-part spine, collarbones, wrists, jaw ----------
V2 = bool(os.environ.get('RIGV2'))
CARD = None
OUTD = D + ('parts_v2/' if V2 else 'parts/')
if V2:
    from rig_v2 import to_v2, BONES, PARENTS
    zc_ = depth_at(my, mcx)
    MOUTHW = (float(mcx), float(RIG['neckY'] + my), float(zc_))
    wristYs = {s: RIG['handY'] + ARM[s]['lh'] * S for s in (-1, 1)}
    n0 = len(IDXd)
    POSd, IDXd, UVd, WF, WJ = to_v2(POSd, IDXd, UVd, WF, RIG, wristYs, MOUTHW, refine, OV)
    WF_V1HEAD = WF[:, BONES.index('Head')] + WF[:, BONES.index('Jaw')] + WF[:, BONES.index('Neck')]   # = the v1 head weight
    CARD = None
    if not OV.get('noHairCards'):
        from hair import process as hair_process
        hw_ = WF[:, BONES.index('Head')] + WF[:, BONES.index('Jaw')]          # not the neck: collars and scarves are cloth, not hair
        # only what is all head: the v1 head weight is smoothed a few rings into the collar, and on characters
        # whose head hangs low the Head/Neck split reaches the shirt collar too
        _c = POSd[IDXd].mean(1); _mx, _my, _mz = MOUTHW
        region_ = ((hw_ + WF[:, BONES.index('Neck')])[IDXd] > 0.97).all(1) & (hw_[IDXd] > 0.5).all(1)
        _v1head = WF_V1HEAD[IDXd].min(1) > 0.97 if WF_V1HEAD is not None else True
        region_ &= _v1head
        # and not the collar band just above the neck base (shirt collars count as 'head' in v1), except a beard in front
        _beard = (np.abs(_c[:, 0] - _mx) < 0.08) & (_c[:, 2] > _mz - 0.08)
        region_ &= ~((_c[:, 1] < headBase + OV.get('collarBand', 0.08)) & ~_beard)
        # never the face itself: the skin from chin to brow in front of the head (an open head shell can look like a card)
        _c = POSd[IDXd].mean(1); _mx, _my, _mz = MOUTHW
        face_ = (np.abs(_c[:, 0] - _mx) < 0.062) & (_c[:, 1] > _my - 0.1) & (_c[:, 1] < _my + 0.11) & (_c[:, 2] > _mz - 0.07)
        region_ &= ~face_
        POSd, CARD, NOV, AOV, hst = hair_process(POSd, IDXd, region_, OV)
        print(f'  hair cards: {hst["cards"]} faces, {hst["strands"]} strands tapered')
    JOINTS = BONES; PARENT = PARENTS
    print(f'  v2 skeleton: {len(JOINTS)} bones, knee refinement {n0} -> {len(IDXd)} triangles')

top = np.argsort(-WF, axis=1)[:, :4]
tw = np.take_along_axis(WF, top, 1); tw[tw < 0.02] = 0; tw /= tw.sum(1, keepdims=True)
tj = np.where(tw > 0, top, 0)
# smooth normals over the refined mesh, merged by position so seams and joints stay soft
_key = np.round(POSd, 6); _u, _inv = np.unique(_key, axis=0, return_inverse=True); _inv = _inv.ravel()
_mm = trimesh.Trimesh(_u, _inv[IDXd], process=False)
NRM = _mm.vertex_normals[_inv].astype(np.float32)
if V2 and CARD is not None:                       # hair cards shade as part of the hair mass
    _ok = ~np.isnan(NOV[:, 0]); NRM[_ok] = NOV[_ok].astype(np.float32)
POS = POSd.astype(np.float32)
UVg = np.c_[UVd[:, 0], 1 - UVd[:, 1]].astype(np.float32)
JNT = tj.astype(np.uint16); WGT = tw.astype(np.float32)
IDX = IDXd.astype(np.uint32)

# mouth strip, in neck space
# narrow, lens-shaped (thin at the corners) so Patron's mood scaling (0.6x .. 2x in x) stays on the lips;
# its curve follows the face at about 1.4x width, the middle of that range
MW = OV.get('mouthW', 0.022); MH = 0.0034; NX = 11
mv, mf = [], []
zc = depth_at(my, mcx)
for dy in (MH / 2, -MH / 2):
    for ix in range(NX):
        u = -1 + 2 * ix / (NX - 1)
        xo = u * MW / 2
        h = dy * (1 - 0.75 * u * u)
        mv.append([xo, h, depth_at(my + h, mcx + xo * 1.4) + 0.0009 - zc])
for ix in range(NX - 1):
    a_, b_ = ix, ix + 1; c_, d_ = NX + ix, NX + ix + 1
    mf += [[a_, c_, b_], [b_, c_, d_]]
mtm = trimesh.Trimesh(np.array(mv), np.array(mf), process=False)
MPOS = mtm.vertices.astype(np.float32); MNRM = mtm.vertex_normals.astype(np.float32); MIDX = mtm.faces.astype(np.uint32)

# eyelids for blinking (v2): one small lid patch per eye, pivot on its top edge, riding the head
LIDS = []
if V2 and not OV.get('noLids'):
    from eyes import find_eyes, lid_patch
    ex_, ey_ = find_eyes(colf, depf, RES, X0, Y1, my, mcx, OV)
    for s_, nm_ in ((-1, 'eyelid_R'), (1, 'eyelid_L')):
        cx_ = OV.get('eyeMidX', mcx) + s_ * ex_                 # eyeMidX: eye centre read off the probe (faces turned off the nose line)
        LV, LF, LUV, ltop = lid_patch(colf, depf, uvf, RES, X0, Y1, cx_, ey_, W=OV.get('lidW', 0.024), H=OV.get('lidH', 0.016))
        LIDS.append((nm_, LV.astype(np.float32), LF.astype(np.uint32), LUV.astype(np.float32), (float(cx_), float(RIG['neckY'] + ltop), 0.0)))
        r_ = int((Y1 - ey_) / RES); c_ = int((cx_ - X0) / RES)
        img_dbg[max(0, r_ - 1):r_ + 2, max(0, c_ - 1):c_ + 2] = [255, 0, 255]
    Image.fromarray(img_dbg).resize((img_dbg.shape[1] * 4, img_dbg.shape[0] * 4), Image.NEAREST).save(D + 'parts/' + name + '_face.png')
    print(f'  eyes at +-{ex_:.3f}, neck-local y {ey_:.3f} (lip line {my:.3f})')

import pygltflib as G
blob = bytearray(); views = []; accs = []


def add_view(data, target=None):
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob.extend(data); views.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target))
    return len(views) - 1


def add_acc(arr, ctype, typ, target=None, minmax=False):
    v = add_view(arr.tobytes(), target)
    a = G.Accessor(bufferView=v, componentType=ctype, count=len(arr), type=typ)
    if minmax: a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1


AB, EAB = G.ARRAY_BUFFER, G.ELEMENT_ARRAY_BUFFER
a_pos = add_acc(POS, G.FLOAT, G.VEC3, AB, True); a_nrm = add_acc(NRM, G.FLOAT, G.VEC3, AB)
a_uv = add_acc(UVg, G.FLOAT, G.VEC2, AB); a_j = add_acc(JNT, G.UNSIGNED_SHORT, G.VEC4, AB); a_w = add_acc(WGT, G.FLOAT, G.VEC4, AB)
if V2 and CARD is not None and CARD.any():
    a_idx = add_acc(IDX[~CARD].ravel(), G.UNSIGNED_INT, G.SCALAR, EAB)
    a_idx_cards = add_acc(IDX[CARD].ravel(), G.UNSIGNED_INT, G.SCALAR, EAB)
    _col = np.repeat(AOV[:, None], 3, 1).astype(np.float32)
    a_col = add_acc(_col, G.FLOAT, G.VEC3, AB)
else:
    a_idx = add_acc(IDX.ravel(), G.UNSIGNED_INT, G.SCALAR, EAB); a_idx_cards = None; a_col = None
ibm = np.stack([np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [-WJ[j][0], -WJ[j][1], -WJ[j][2], 1]], np.float32) for j in JOINTS])
a_ibm = add_acc(ibm.reshape(len(JOINTS), 16), G.FLOAT, G.MAT4)
m_pos = add_acc(MPOS, G.FLOAT, G.VEC3, AB, True); m_nrm = add_acc(MNRM, G.FLOAT, G.VEC3, AB); m_idx = add_acc(MIDX.ravel(), G.UNSIGNED_INT, G.SCALAR, EAB)
import trimesh as _tm
lid_acc = []
for nm_, LV, LF, LUV, piv in LIDS:
    ln = _tm.Trimesh(LV, LF, process=False).vertex_normals.astype(np.float32)
    luv = np.c_[LUV[:, 0], 1 - LUV[:, 1]].astype(np.float32)
    lid_acc.append((add_acc(LV, G.FLOAT, G.VEC3, AB, True), add_acc(ln, G.FLOAT, G.VEC3, AB), add_acc(LF.ravel(), G.UNSIGNED_INT, G.SCALAR, EAB), add_acc(luv, G.FLOAT, G.VEC2, AB)))
jb = io.BytesIO(); img.save(jb, 'JPEG', quality=88); v_img = add_view(jb.getvalue())

nodes = [G.Node(name='body', children=[])]
nid = {'body': 0}
for j in JOINTS:
    par = PARENT[j]; pw = np.array(WJ[par]) if par != 'body' else np.zeros(3)
    nodes.append(G.Node(name=j, translation=(np.array(WJ[j]) - pw).tolist(), children=[])); nid[j] = len(nodes) - 1
for j in JOINTS:
    nodes[nid[PARENT[j]]].children.append(nid[j])
nodes.append(G.Node(name='character', mesh=0, skin=0)); n_char = len(nodes) - 1
nodes.append(G.Node(name='mouth', mesh=1, translation=[float(mcx), float(my), float(zc)])); n_mouth = len(nodes) - 1
EXTRA_MESHES, EXTRA_MATS = [], []
if V2:   # mouth rides the jaw; lids ride the head; beards open the jaw wider
    nodes[n_mouth].translation = (np.array(MOUTHW) - np.array(WJ['Jaw'])).tolist()
    nodes[nid['Jaw']].children.append(n_mouth)
    nodes[nid['Jaw']].extras = {'jawScale': OV.get('jawScale', 1.6 if OV.get('mouthShade', 0.8) < 0.5 else 1.0)}
    for k_, (nm_, LV, LF, LUV, piv) in enumerate(LIDS):   # lids wear the face texture (the skin just above the eye)
        EXTRA_MESHES.append(G.Mesh(name=nm_, primitives=[G.Primitive(attributes=G.Attributes(POSITION=lid_acc[k_][0], NORMAL=lid_acc[k_][1], TEXCOORD_0=lid_acc[k_][3]), indices=lid_acc[k_][2], material=0)]))
        hw = np.array(WJ['Head'])
        nodes.append(G.Node(name=nm_, mesh=2 + k_, translation=[piv[0] - hw[0], piv[1] - hw[1], 0.0 - hw[2]]))
        nodes[nid['Head']].children.append(len(nodes) - 1)
else:
    nodes[nid['neck']].children.append(n_mouth)
CARD_PRIMS = []
if a_idx_cards is not None:
    EXTRA_MATS.append(G.Material(name='hair-cards', doubleSided=True, pbrMetallicRoughness=G.PbrMetallicRoughness(baseColorTexture=G.TextureInfo(index=0), metallicFactor=0.0, roughnessFactor=0.9)))
    CARD_PRIMS.append(G.Primitive(attributes=G.Attributes(POSITION=a_pos, NORMAL=a_nrm, TEXCOORD_0=a_uv, JOINTS_0=a_j, WEIGHTS_0=a_w, COLOR_0=a_col), indices=a_idx_cards, material=2 + len(EXTRA_MATS) - 1))
gl = G.GLTF2(
    asset=G.Asset(generator='fox-fiddle western reskin', version='2.0'),
    scene=0, scenes=[G.Scene(nodes=[0, n_char])], nodes=nodes,
    meshes=[G.Mesh(name=name, primitives=[G.Primitive(attributes=G.Attributes(POSITION=a_pos, NORMAL=a_nrm, TEXCOORD_0=a_uv, JOINTS_0=a_j, WEIGHTS_0=a_w), indices=a_idx, material=0)] + CARD_PRIMS),
            G.Mesh(name='mouth', primitives=[G.Primitive(attributes=G.Attributes(POSITION=m_pos, NORMAL=m_nrm), indices=m_idx, material=1)])] + EXTRA_MESHES,
    skins=[G.Skin(name=name, joints=[nid[j] for j in JOINTS], inverseBindMatrices=a_ibm, skeleton=0)],
    materials=[G.Material(name=name, doubleSided=True, pbrMetallicRoughness=G.PbrMetallicRoughness(baseColorTexture=G.TextureInfo(index=0), metallicFactor=0.0, roughnessFactor=0.85)),
               G.Material(name='mouth', doubleSided=True, pbrMetallicRoughness=G.PbrMetallicRoughness(baseColorFactor=lip + [1.0], metallicFactor=0.0, roughnessFactor=0.6))] + EXTRA_MATS,
    textures=[G.Texture(sampler=0, source=0)], samplers=[G.Sampler(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)],
    images=[G.Image(bufferView=v_img, mimeType='image/jpeg')],
    accessors=accs, bufferViews=views, buffers=[G.Buffer(byteLength=len(blob))])
gl.set_binary_blob(bytes(blob))
os.makedirs(OUTD, exist_ok=True)
gl.save_binary(OUTD + name + '.glb')

# static rest-pose preview (for quick checks outside the game)
pv = trimesh.Scene()
pm = trimesh.Trimesh(POS, IDX, vertex_normals=NRM, process=False); pm.visual = trimesh.visual.TextureVisuals(uv=UVd, material=M)
pv.add_geometry(pm, node_name='character')
pv.export(OUTD + name + '_preview.glb')

json.dump({'neck': neckY, 'shTop': shTop, 'crotch': crotchY, 'hem': hemY, 'S': S, 'skirt': bool(skirt),
           'pitch': pitch, 'counts': {p: int(len(faces_of.get(p, []))) for p in order}}, open(OUTD + name + '.json', 'w'), indent=1)
print('  faces', {p: int(len(faces_of.get(p, []))) for p in order})
