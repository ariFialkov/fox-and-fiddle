"""Patron v2 skeleton for the character builder.

Takes the mesh and the v1 weights that west_char_rig.py makes (10 joints) and turns them into weights on
the v2 standard skeleton (Mixamo names, see RIG_SPEC.md): the torso split over Hips / Spine / Spine1 /
Spine2 with collarbones, legs split at knee and ankle (with finer triangles around the knee and a knee
shaped like a knee), the v1 neck split into Neck / Head / Jaw, and the v1 hand joint becoming the wrist.
All bones rest with identity orientation; the GLB's node translations carry this character's proportions.
"""
import numpy as np

BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'Jaw',
         'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandSocket',
         'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandSocket',
         'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightKneeHelper', 'LeftKneeHelper',
         'RightForeArmTwist', 'LeftForeArmTwist', 'RightHandFingers1', 'RightHandFingers2', 'LeftHandFingers1', 'LeftHandFingers2']
PARENTS = {'Hips': 'body', 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck', 'Jaw': 'Head',
           'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', 'RightHandSocket': 'RightHand',
           'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', 'LeftHandSocket': 'LeftHand',
           'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg',
           'RightKneeHelper': 'RightUpLeg', 'LeftKneeHelper': 'LeftUpLeg',
           'RightForeArmTwist': 'RightForeArm', 'LeftForeArmTwist': 'LeftForeArm',
           'RightHandFingers1': 'RightHand', 'RightHandFingers2': 'RightHandFingers1',
           'LeftHandFingers1': 'LeftHand', 'LeftHandFingers2': 'LeftHandFingers1'}
BI = {b: i for i, b in enumerate(BONES)}
# v1 joint order in WF: torso, hip_0, hip_1, pivot_0, fore_0, hand_0, pivot_1, fore_1, hand_1, neck (index 0 = x < 0 = Right)


def ss(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def smooth_region(P, F, m, iters, lam=0.5, mu=-0.53):
    """Taubin smoothing (no shrink) of the vertices weighted by m (0..1), duplicates at UV seams moved together."""
    key = np.round(P, 6); U, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    mu_ = np.zeros(len(U)); np.maximum.at(mu_, inv, m)
    E = np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]; E = inv[E]; E = E[E[:, 0] != E[:, 1]]
    E = np.unique(np.sort(E, 1), axis=0)
    deg = np.bincount(E.ravel(), minlength=len(U)).astype(float)
    Q = U.astype(float).copy()
    for it in range(iters):
        for f_ in (lam, mu):
            acc = np.zeros_like(Q); np.add.at(acc, E[:, 0], Q[E[:, 1]]); np.add.at(acc, E[:, 1], Q[E[:, 0]])
            lap = acc / np.maximum(deg, 1)[:, None] - Q
            Q += f_ * mu_[:, None] * lap
    return Q[inv]


def to_v2(POSd, IDXd, UVd, WF, RIG, wristY, mouth, refine, OV=None):
    """mouth = (x, y, z) world position of the lip line. Returns POSd, IDXd, UVd, W (n, len(BONES)), WJ."""
    OV = OV or {}
    if OV.get('beardSmooth'):
        # round off lumpy beard bottoms (a Meshy artefact on some bearded heads): below the lips, in front of the neck
        mx_, my_, mz_ = mouth
        Yb, Zb = POSd[:, 1], POSd[:, 2]
        m = (WF[:, 9] > 0.3) * ss((my_ - 0.035 - Yb) / 0.03) * ss((Zb - (mz_ - 0.1)) / 0.03) * ss((Yb - (my_ - 0.3)) / 0.03)
        POSd = smooth_region(POSd, IDXd, m, int(OV['beardSmooth']))
    KY = OV.get('kneeY', 0.42)          # knee height at height 1.0
    AY = OV.get('ankleY', 0.10)         # ankle height
    # ---- finer triangles around each knee ----
    for s_, li in ((-1, 1), (1, 2)):
        for it in range(OV.get('kneeRefine', 2)):
            cen = POSd[IDXd].mean(1)
            sel = (WF[:, li][IDXd].min(1) > 0.6) & (np.abs(cen[:, 1] - KY) < (0.07, 0.04)[min(it, 1)])
            POSd, IDXd, (UVd, WF) = refine(POSd, IDXd, [UVd, WF], sel)
    # hands fused to the hips or a coat (Meshy sometimes joins them in the A-pose): cut the faces that bridge a hand
    # and the body below the elbows, and make the weights there all-arm or all-body, so a raised arm doesn't pull a
    # ribbon of skin off the hip
    if WF.shape[1] > 10:
        hard = WF[:, 10] > 0.5                          # vertex labelled arm before any smoothing
        WF = WF[:, :10].copy()
        below = POSd[:, 1] < RIG['elY'] - OV.get('bridgeBelowElbow', 0.06)
        lowF = below[IDXd].all(1)
        bridge = lowF & hard[IDXd].any(1) & ~hard[IDXd].all(1)
        IDXd = IDXd[~bridge]
        # pieces left on their own by the cut (fingertips Meshy fused to a thigh) belong to the nearest hand
        from scipy.sparse import coo_matrix
        from scipy.sparse.csgraph import connected_components
        key = np.round(POSd, 6); _u, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
        E = inv[np.r_[IDXd[:, [0, 1]], IDXd[:, [1, 2]], IDXd[:, [2, 0]]]]
        nc, lab = connected_components(coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(len(_u), len(_u))), directed=False)
        lab = lab[inv]; sizes = np.bincount(lab)
        used = np.zeros(len(POSd), bool); used[IDXd.ravel()] = True
        moved = 0
        for k in np.where(sizes < OV.get('fingerPiece', 400))[0]:
            vs = np.where((lab == k) & used)[0]
            if not len(vs) or not below[vs].all() or hard[vs].any(): continue
            side = 8 if POSd[vs, 0].mean() > 0 else 5                 # v1 hand_1 (x > 0) or hand_0
            WF[vs] = 0; WF[vs, side] = 1; hard[vs] = True; moved += len(vs)
        if moved: print(f'  loose fingertips given back to the hands: {moved} vertices')
        arm_ = below & hard; body_ = below & ~hard
        WF[arm_, :3] = 0; WF[arm_, 9] = 0
        WF[body_, 3:9] = 0
        WF /= np.maximum(WF.sum(1, keepdims=True), 1e-9)
        print(f'  hand-body bridges cut: {int(bridge.sum())} faces')
    X, Y, Z = POSd[:, 0], POSd[:, 1], POSd[:, 2]
    W = np.zeros((len(POSd), len(BONES)))
    WJ = {}

    # ---- legs: thigh / shin / foot ----
    for side, li in (('Right', 1), ('Left', 2)):
        w = WF[:, li]
        on = w > 0.3
        near_k = on & (np.abs(Y - KY) < 0.04)
        zk = float(np.median(Z[near_k])) if near_k.any() else 0.0
        # the knee turns about an axis toward the back of the leg: with the axis at the middle, the back of the
        # calf swings up through the back of the thigh on a deep bend (a fin behind the knee)
        if near_k.any():
            zb, zf = np.percentile(Z[near_k], 3), np.percentile(Z[near_k], 97)
            zpiv = zb + OV.get('kneeAxis', 0.3) * (zf - zb)
        else:
            zpiv = zk
        near_a = on & (np.abs(Y - AY - 0.03) < 0.03)
        za = float(np.median(Z[near_a])) if near_a.any() else 0.0
        front = np.clip((Z - zk) / 0.05, 0, 1)            # kneecap at the front stays with the thigh a little longer
        back = np.clip((zk - Z) / 0.05, 0, 1)             # the crease behind the knee: a wider blend, so it folds instead of pinching
        hinge = KY - 0.024 * front + OV.get('kneeBackUp', 0.01) * back
        band = 0.03 + OV.get('kneeBandFront', 0.04) * front + OV.get('kneeBandBack', 0.05) * back
        shin = ss((hinge + band / 2 - Y) / band)
        foot = ss((AY + 0.015 - Y) / 0.03)
        # knee helper turns half as far as the knee: the bend's middle rides it, so the crease folds
        # around an arc instead of collapsing into a fin
        helper = np.minimum(2 * shin, 2 * (1 - shin)) * OV.get('kneeHelper', 1.0)
        thigh = (1 - shin) - helper / 2
        shin_ = shin - helper / 2
        W[:, BI[side + 'UpLeg']] = w * thigh
        W[:, BI[side + 'KneeHelper']] = w * helper * (1 - foot)
        W[:, BI[side + 'Leg']] = w * shin_ * (1 - foot)
        W[:, BI[side + 'Foot']] = w * (shin_ + helper) * foot
        sx = -1 if side == 'Right' else 1
        WJ[side + 'UpLeg'] = (sx * RIG['hipX'], RIG['hipY'], 0.0)
        WJ[side + 'Leg'] = (sx * RIG['hipX'], KY, zpiv)
        WJ[side + 'KneeHelper'] = (sx * RIG['hipX'], KY, zpiv)
        WJ[side + 'Foot'] = (sx * RIG['hipX'], AY, za)

    # ---- arms: v1 pivot / fore / hand -> Arm / ForeArm / Hand (wrist) ----
    for side, (pv, fo, ha) in (('Right', (3, 4, 5)), ('Left', (6, 7, 8))):
        sx = -1 if side == 'Right' else 1
        W[:, BI[side + 'Arm']] = WF[:, pv]
        # forearm twist: a helper half way down turns half as far as the wrist, so the forearm turns along its
        # length when the hand turns its palm to a prop (no candy-wrapper at the wrist)
        sf = np.clip((RIG['elY'] - Y) / max(RIG['elY'] - wristY[sx], 1e-3), 0, 1)
        tw = np.minimum(2 * sf, 1.0)
        W[:, BI[side + 'ForeArm']] = WF[:, fo] * (1 - tw)
        W[:, BI[side + 'ForeArmTwist']] = WF[:, fo] * tw
        # fingers: two joints (knuckles, middle), the thumb left on the hand; the hand hangs with its palm facing
        # the body, fingers down, side by side along z
        wh = WF[:, ha]
        hv = wh > 0.5
        top, bot = float(Y[hv].max()), float(Y[hv].min()); L = top - bot
        yk, ym = top - OV.get('knuckle', 0.5) * L, top - OV.get('fingerMid', 0.71) * L
        hc = float(np.median(X[hv & (Y < yk)]))
        zf = float(Z[hv].max())
        medial = -sx                                      # the palm faces the body
        thumb = ss((medial * (X - hc) - 0.024) / 0.012) * ss((Y - (yk - 0.03)) / 0.015) * ss((Z - (zf - 0.045)) / 0.015)
        f1 = ss((yk + 0.006 - Y) / 0.012) * (1 - thumb)
        f2 = ss((ym + 0.006 - Y) / 0.012)
        W[:, BI[side + 'Hand']] = wh * (1 - f1)
        W[:, BI[side + 'HandFingers1']] = wh * f1 * (1 - f2)
        W[:, BI[side + 'HandFingers2']] = wh * f1 * f2
        zc_h = float(np.median(Z[hv & (Y < yk)]))
        # the wrist (twist axis) sits at the middle of the actual wrist, not on the v1 line
        nw = ((WF[:, fo] + wh) > 0.5) & (np.abs(Y - wristY[sx]) < 0.012)
        hx_, hz_ = (float(np.median(X[nw])), float(np.median(Z[nw]))) if nw.any() else (sx * RIG['shX'], 0.0)
        WRIST = (hx_, wristY[sx], hz_)
        WJ[side + 'ForeArmTwist'] = ((sx * RIG['shX'] + hx_) / 2, (RIG['elY'] + wristY[sx]) / 2, hz_ / 2)
        WJ[side + 'HandFingers1'] = (hc, yk, zc_h)
        WJ[side + 'HandFingers2'] = (hc, ym, zc_h)
        WJ[side + 'Shoulder'] = (sx * 0.05, RIG['shY'] - 0.05, 0.0)
        WJ[side + 'Arm'] = (sx * RIG['shX'], RIG['shY'], 0.0)
        WJ[side + 'ForeArm'] = (sx * RIG['shX'], RIG['elY'], 0.0)
        WJ[side + 'Hand'] = WRIST
        WJ[side + 'HandSocket'] = (sx * RIG['shX'], RIG['handY'], 0.0)

    # ---- torso: pelvis / lower back / mid back / chest, collarbones on top ----
    wt = WF[:, 0]
    s1 = ss((Y - 0.83) / 0.08)
    s2 = ss((Y - 0.97) / 0.08)
    s3 = ss((Y - 1.11) / 0.08)
    W[:, BI['Hips']] = wt * (1 - s1)
    W[:, BI['Spine']] = wt * s1 * (1 - s2)
    W[:, BI['Spine1']] = wt * s2 * (1 - s3)
    chest = wt * s3
    for side in ('Right', 'Left'):
        sx = -1 if side == 'Right' else 1
        cl = ss((X * sx - 0.07) / 0.11) * ss((Y - (RIG['shY'] - 0.16)) / 0.12) * 0.75
        W[:, BI[side + 'Shoulder']] = chest * cl
        chest = chest * (1 - cl)
    W[:, BI['Spine2']] = chest
    WJ['Hips'] = (0.0, RIG['hipY'], 0.0)
    WJ['Spine'] = (0.0, RIG['torsoY'], 0.0)
    WJ['Spine1'] = (0.0, 0.95, 0.0)
    WJ['Spine2'] = (0.0, 1.12, 0.0)

    # ---- neck / head / jaw ----
    mx, my, mz = mouth
    wn = WF[:, 9]
    head = ss((Y - (my - 0.075)) / 0.04)
    jaw = (ss((my + 0.003 - Y) / 0.008) * ss((Z - (mz - 0.055)) / 0.03)
           * (1 - ss((np.abs(X - mx) - 0.032) / 0.022)) * ss((Y - (my - 0.085)) / 0.03)) * 0.9
    W[:, BI['Neck']] = wn * (1 - head)
    W[:, BI['Head']] = wn * head * (1 - jaw)
    W[:, BI['Jaw']] = wn * head * jaw
    WJ['Neck'] = (0.0, RIG['neckY'], 0.0)
    WJ['Head'] = (0.0, my + 0.035, mz - 0.09)       # about level with the ears, over the top of the spine
    WJ['Jaw'] = (0.0, my + 0.028, mz - 0.07)        # hinge in front of the ears

    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    return POSd, IDXd, UVd, W, WJ
