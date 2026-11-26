"""Small Meshy API client. Key is read from ~/.secrets/meshy.key, never printed.

Usage (as a module):
    from meshy import create, wait_all, download
"""
import json
import os
import time
import urllib.request

API = "https://api.meshy.ai/openapi"
KEY = open(os.path.expanduser("~/.secrets/meshy.key")).read().strip()
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

PATHS = {
    "image-to-image": "/v1/image-to-image",
    "text-to-image": "/v1/text-to-image",
    "image-to-3d": "/v1/image-to-3d",
    "remesh": "/v1/remesh",
    "retexture": "/v1/retexture",
}


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:400]}")


def create(kind, body):
    return _req("POST", PATHS[kind], body)["result"]


def get(kind, task_id):
    return _req("GET", f"{PATHS[kind]}/{task_id}")


def wait_all(jobs, timeout=900, every=8):
    """jobs: {name: (kind, task_id)} -> {name: task}"""
    done, t0 = {}, time.time()
    while len(done) < len(jobs) and time.time() - t0 < timeout:
        for name, (kind, tid) in jobs.items():
            if name in done:
                continue
            t = get(kind, tid)
            if t["status"] in ("SUCCEEDED", "FAILED", "CANCELED"):
                done[name] = t
                print(f"{name}: {t['status']} credits={t.get('consumed_credits')}"
                      + (f" err={t.get('task_error')}" if t["status"] != "SUCCEEDED" else ""),
                      flush=True)
        if len(done) < len(jobs):
            time.sleep(every)
    for name in jobs:
        if name not in done:
            print(f"{name}: still running after {timeout}s", flush=True)
    return done


def download(url, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def balance():
    return _req("GET", "/v1/balance")["balance"]
