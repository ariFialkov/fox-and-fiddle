"""Eyelids for blinking: find the painted eyes on the face probe and build a small lid patch for each.

Everything is in neck-local space (the probe's space). A lid is a curved patch that follows the face just in
front of the eye, its pivot on the top edge; Patron v2 scales it in y from 0 (open, hidden) to 1 (closed)."""
import numpy as np


def find_eyes(colf, depf, RES, X0, Y1, my, mcx, OV):
    """my = lip-line height (neck-local). Eyes are the darkest spots 4 .. 7.5 cm above it (measured on the
    cast: 4.9 .. 6.5 cm), 1.6 .. 4.4 cm either side of the face centre."""
    rowy = lambda r: Y1 - (r + 0.5) * RES
    rowof = lambda y: int(np.clip((Y1 - y) / RES, 0, colf.shape[0] - 1))
    colof = lambda x: int(np.clip((x - X0) / RES, 0, colf.shape[1] - 1))
    lum = colf @ np.array([0.3, 0.55, 0.15])
    lum = np.where(depf > -1e8, lum, 1.0)
    # box blur 5x5 so the iris / lash line wins over single dark texels
    k = 2; pad = np.pad(lum, k, mode='edge'); sm = np.zeros_like(lum)
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            sm += pad[k + dy:k + dy + lum.shape[0], k + dx:k + dx + lum.shape[1]]
    sm /= (2 * k + 1) ** 2
    r0, r1 = rowof(my + OV.get('eyeHi', 0.075)), rowof(my + OV.get('eyeLo', 0.04))
    found = []
    for s in (-1, 1):
        c0, c1 = sorted((colof(mcx + s * 0.016), colof(mcx + s * 0.044)))
        win = sm[r0:r1 + 1, c0:c1 + 1]
        j, i = np.unravel_index(np.argmin(win), win.shape)
        found.append((X0 + (c0 + i + 0.5) * RES - mcx, rowy(r0 + j)))
    ex = (abs(found[0][0]) + abs(found[1][0])) / 2 + OV.get('eyeDX', 0.0)
    ey = (found[0][1] + found[1][1]) / 2 + OV.get('eyeDY', 0.0)
    if 'eyeY' in OV: ey = OV['eyeY']                      # read off the face probe by hand
    if 'eyeX' in OV: ex = OV['eyeX']
    return float(ex), float(ey)


def lid_patch(colf, depf, uvf, RES, X0, Y1, cx, ey, W=0.024, H=0.016, NX=7, NY=4):
    """Vertices relative to the pivot (top centre of the lid), faces, and UVs: the lid wears the skin between
    the eye and the brow, stretched down over the eye, so a closed eye shows a lid in the face's own texture."""
    rowof = lambda y: int(np.clip((Y1 - y) / RES, 0, colf.shape[0] - 1))
    colof = lambda x: int(np.clip((x - X0) / RES, 0, colf.shape[1] - 1))

    def depth(x, y):
        r, c = rowof(y), colof(x)
        d = depf[max(0, r - 1):r + 2, max(0, c - 1):c + 2]; d = d[d > -1e8]
        return float(d.max()) if len(d) else None
    top = ey + H / 2
    zs = [depth(cx + u, ey + v) for u in np.linspace(-W / 2, W / 2, 5) for v in np.linspace(-H / 2, H / 2, 3)]
    zs = [z for z in zs if z is not None]
    zmax = max(zs) if zs else 0.1
    zmed = float(np.median(zs)) if zs else 0.1
    V, UV, SRC = [], [], []
    for j in range(NY):
        for i in range(NX):
            u = -W / 2 + W * i / (NX - 1); v = -H * j / (NY - 1)
            taper = 1 - 0.35 * (2 * i / (NX - 1) - 1) ** 2        # almond: shorter at the corners
            v *= taper
            z = depth(cx + u, top + v)
            # stay on the face: hair strands, brims and spectacles in front of the eye don't pull the lid out
            z = float(np.clip(z if z is not None else zmed, zmed - 0.004, zmed + 0.003)) + 0.0016
            V.append([u, v, z])
            sy = (top - H) - 0.003 - (-v) / H * 0.004             # source: the skin 3 .. 7 mm below the eye (brows above are often hair-coloured)
            UV.append(uvf[rowof(sy), colof(cx + u)]); SRC.append(colf[rowof(sy), colof(cx + u)])
    F = []
    for j in range(NY - 1):
        for i in range(NX - 1):
            a = j * NX + i; b = a + 1; c = a + NX; d = c + 1
            F += [[a, c, b], [b, c, d]]
    V = np.array(V); UV = np.array(UV)
    # a lid must not straddle a UV seam: samples far from the lid's median UV take the median
    cell = np.round(UV / 0.04).astype(int); keys, cnt = np.unique(cell, axis=0, return_counts=True)
    main = np.all(cell == keys[np.argmax(cnt)], 1)
    med = np.median(UV[main], 0); far = np.abs(UV - med).max(1) > 0.03
    # far samples take the UV of the nearest sample on the main island
    for i in np.where(far)[0]:
        ok = np.where(~far)[0]; j = ok[np.argmin(np.linalg.norm(V[ok, :2] - V[i, :2], axis=1))]; UV[i] = UV[j]

    return V, np.array(F), UV, top
