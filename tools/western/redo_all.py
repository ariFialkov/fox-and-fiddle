"""Regenerate the cast with Meshy 6 (image-to-3D, A-pose, remeshed to 16k triangles) from the same reference pictures."""
import base64, sys, os
sys.path.insert(0, '/home/claude/scripts')
from meshy import create, wait_all, download
from west_char_cast import CAST
names = sys.argv[1:] or [n for n in CAST if n != 'sal']
R = '/home/claude/models/west/chars/'
jobs = {}
for n in names:
    img = 'data:image/png;base64,' + base64.b64encode(open(R + f'refs/{n}.png', 'rb').read()).decode()
    body = {'image_url': img, 'ai_model': 'meshy-6', 'should_remesh': True, 'topology': 'triangle', 'target_polycount': 16000, 'should_texture': True, 'pose_mode': 'a-pose'}
    jobs[n] = ('image-to-3d', create('image-to-3d', body)); print(n, 'submitted', flush=True)
done = wait_all(jobs, timeout=3000)
for n, t in done.items():
    if t['status'] == 'SUCCEEDED':
        download(t['model_urls']['glb'], R + f'redo/{n}_meshy-6.glb'); print(n, 'saved', flush=True)
