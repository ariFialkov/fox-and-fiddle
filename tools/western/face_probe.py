"""Front orthographic texture probe of a head (neck-local, +Z = face): returns colour image, depth, grid coords."""
import numpy as np


def front_raster(L, F, U, tex, x0, x1, y0, y1, res=0.001, want_uv=False):
    W = int(round((x1 - x0) / res)); H = int(round((y1 - y0) / res))
    col = np.zeros((H, W, 3)); dep = np.full((H, W), -1e9); uvm = np.zeros((H, W, 2))
    th, tw = tex.shape[:2]
    T = L[F]; UVt = U[F]
    keep = (T[:, :, 0].max(1) >= x0) & (T[:, :, 0].min(1) <= x1) & (T[:, :, 1].max(1) >= y0) & (T[:, :, 1].min(1) <= y1)
    for tri, uvs in zip(T[keep], UVt[keep]):
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        i0 = max(0, int((min(ax, bx, cx) - x0) / res)); i1 = min(W - 1, int((max(ax, bx, cx) - x0) / res) + 1)
        j0 = max(0, int((min(ay, by, cy) - y0) / res)); j1 = min(H - 1, int((max(ay, by, cy) - y0) / res) + 1)
        if i1 < i0 or j1 < j0:
            continue
        xs = x0 + (np.arange(i0, i1 + 1) + 0.5) * res; ys = y0 + (np.arange(j0, j1 + 1) + 0.5) * res
        X, Y = np.meshgrid(xs, ys)
        w0 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / den
        w1 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        z = w0 * az + w1 * bz + w2 * cz
        sub = dep[j0:j1 + 1, i0:i1 + 1]
        upd = inside & (z > sub)
        if not upd.any():
            continue
        u = (w0 * uvs[0, 0] + w1 * uvs[1, 0] + w2 * uvs[2, 0]) % 1.0
        v = (w0 * uvs[0, 1] + w1 * uvs[1, 1] + w2 * uvs[2, 1]) % 1.0
        px = tex[np.clip(((1 - v) * th).astype(int), 0, th - 1), np.clip((u * tw).astype(int), 0, tw - 1)]
        sub[upd] = z[upd]
        col[j0:j1 + 1, i0:i1 + 1][upd] = px[upd]
        uvm[j0:j1 + 1, i0:i1 + 1][upd] = np.stack([u, v], -1)[upd]
    if want_uv: return col[::-1], dep[::-1], uvm[::-1]
    return col[::-1], dep[::-1]   # row 0 = top
