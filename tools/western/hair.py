"""Hair strands and hat fringes: Meshy builds them as thin single-sided cards. Rendered as they are they read
as flat cardboard: hard rectangular tips, flat shading, and black backs (a double-sided material flips the
normal on the back face). This finds the cards on the head and makes them read as hair:

- tapered tips on long hanging strands (clumps, not rectangles),
- volume normals: the card shades as part of the hair mass around the head, the same from either side,
- occlusion: darker where the card meets the head or the hat, lighter at the free ends.

Card faces go into their own primitive (material 'hair-cards'); dressPatron2 turns off the back-face flip there.
"""
import numpy as np
import trimesh
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components


def ss(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def find_cards(P, F, region_faces, thin=0.006):
    """Faces of the region that are sheets: nothing solid behind them (the first thing a ray finds going in
    through the face is another surface's front, or nothing), or a back within `thin`."""
    fidx = np.where(region_faces)[0]
    sub = trimesh.Trimesh(P, F[fidx], process=False)
    c = sub.triangles_center; n = sub.face_normals
    o = c - n * 1e-4
    loc, ri, ti = sub.ray.intersects_location(o, -n, multiple_hits=False)
    card = np.ones(len(fidx), bool)                     # no hit: a sheet with nothing behind
    if len(ri):
        d = np.linalg.norm(loc - c[ri], axis=1)
        exiting = (n[ti] * -n[ri]).sum(1) > 0           # hit a back face going out: we were inside a solid
        solid = exiting & (d > thin)
        card[ri[solid]] = False
    out = np.zeros(len(F), bool); out[fidx[card]] = True
    return out


def process(P, F, region_faces, OV=None):
    """Returns P (tips tapered), card face mask, per-vertex normal override (nan where none), per-vertex AO."""
    OV = OV or {}
    P = P.copy()
    card = find_cards(P, F, region_faces, OV.get('cardThin', 0.006))
    # hat brims are sheets too, but lie flat: they keep ordinary two-sided shading (a darker underside); only
    # hanging sheets (strands, fringes, beards) are treated as hair
    fn = trimesh.Trimesh(P, F, process=False).face_normals
    card &= np.abs(fn[:, 1]) < OV.get('cardFlat', 0.6)
    key = np.round(P, 6); U, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    cv = np.zeros(len(P), bool); cv[F[card].ravel()] = True                          # vertices of card faces
    sv = np.zeros(len(P), bool); sv[F[region_faces & ~card].ravel()] = True          # vertices of solid head faces
    only_card_u = np.zeros(len(U), bool); only_card_u[inv[cv]] = True; only_card_u[inv[sv]] = False
    free = only_card_u[inv]                                                           # card vertices not on the solid

    # ---- taper long hanging strands: components of card faces, elongated and roughly vertical ----
    E = np.r_[F[card][:, [0, 1]], F[card][:, [1, 2]], F[card][:, [2, 0]]]; E = inv[E]
    if len(E):
        A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(len(U), len(U)))
        ncomp, lab = connected_components(A, directed=False)
        used = np.zeros(len(U), bool); used[E.ravel()] = True
        tapered = 0
        for k in range(ncomp):
            ids = np.where((lab == k) & used)[0]
            if len(ids) < 6: continue
            Q = U[ids]; cen = Q.mean(0)
            w, v = np.linalg.eigh(np.cov((Q - cen).T)); ax = v[:, -1]
            if ax[1] > 0: ax = -ax                                                     # along the strand, root to tip (downward)
            t = (Q - cen) @ ax; length = t.max() - t.min()
            width = 2 * np.sqrt(max(w[-2], 1e-12)) * 2
            if abs(ax[1]) < 0.55 or length < 2.5 * width or length < 0.03: continue
            s = (t - t.min()) / max(length, 1e-6)                                     # 0 root .. 1 tip
            line = cen + np.outer(t, ax)
            squeeze = 1 - OV.get('taper', 0.65) * ss((s - 0.35) / 0.65) ** 1.2
            newQ = line + (Q - line) * squeeze[:, None]
            m = only_card_u[ids]                                                       # never move vertices shared with the head
            U[ids[m]] = newQ[m]
            tapered += 1
        P = U[inv].copy()
    else:
        tapered = 0

    # ---- volume normals and occlusion ----
    solidP = P[sv] if sv.any() else P
    centre = np.median(solidP, 0) + np.array([0, -0.01, -0.01])
    N = np.full(P.shape, np.nan)
    rad = P - centre; rad /= np.linalg.norm(rad, axis=1, keepdims=True) + 1e-9
    tm = trimesh.Trimesh(P, F, process=False)
    vn = np.asarray(tm.vertex_normals)
    vn = np.where(((vn * rad).sum(1) < 0)[:, None], -vn, vn)                          # face it outward
    nb = 0.75 * rad + 0.25 * vn; nb /= np.linalg.norm(nb, axis=1, keepdims=True) + 1e-9
    N[cv] = nb[cv]
    ao = np.ones(len(P))
    if sv.any():
        d, _ = cKDTree(P[sv]).query(P[cv])
        ao[cv] = 0.55 + 0.45 * ss(d / OV.get('aoReach', 0.035))
    return P, card, N, ao, dict(cards=int(card.sum()), strands=tapered)
