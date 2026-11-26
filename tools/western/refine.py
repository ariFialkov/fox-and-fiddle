"""Conforming local refinement (red-green): split every edge of the selected faces at its midpoint,
and split neighbouring faces just enough to stay crack-free. Works on meshes whose vertices are
duplicated at UV seams: edges are matched by position, so both sides of a seam split together."""
import numpy as np


def refine(P, F, attrs, sel):
    """P (n,3), F (m,3) int, attrs: list of (n,k) arrays interpolated at midpoints, sel: bool (m,)
    returns P, F, attrs"""
    key = np.round(P, 6)
    _, mid = np.unique(key, axis=0, return_inverse=True)
    mid = mid.ravel()
    split = set()
    for f in F[sel]:
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            split.add((min(mid[a], mid[b]), max(mid[a], mid[b])))
    newP, newA, cache = [P], [[a] for a in attrs], {}
    n = len(P)

    def midpoint(a, b):
        nonlocal n
        k = (min(a, b), max(a, b))
        if k in cache:
            return cache[k]
        newP.append(((P[a] + P[b]) / 2)[None])
        for i, at in enumerate(attrs):
            newA[i].append(((at[a] + at[b]) / 2)[None])
        cache[k] = n; n += 1
        return cache[k]

    out = []
    for f in F:
        a, b, c = f
        s = [(min(mid[x], mid[y]), max(mid[x], mid[y])) in split for x, y in ((a, b), (b, c), (c, a))]
        k = sum(s)
        if k == 0:
            out.append((a, b, c)); continue
        if k == 3:
            ab, bc, ca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
            out += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]; continue
        # rotate so the split pattern starts at a fixed edge
        verts = [a, b, c]
        for r in range(3):
            if k == 1 and s[0]:
                break
            if k == 2 and s[0] and s[1]:
                break
            verts = verts[1:] + verts[:1]; s = s[1:] + s[:1]
        a, b, c = verts
        if k == 1:
            ab = midpoint(a, b)
            out += [(a, ab, c), (ab, b, c)]
        else:  # edges ab and bc split
            ab, bc = midpoint(a, b), midpoint(b, c)
            out += [(a, ab, c), (ab, b, bc), (ab, bc, c)]
    return np.concatenate(newP), np.array(out, dtype=F.dtype), [np.concatenate(x) for x in newA]
