"""Rig Sal's v2 rest pose (arms down) with Meshy's Mixamo-named skeleton, then fetch a set of library clips on that rig."""
import base64, json, sys, time
sys.path.insert(0, '/home/claude/scripts')
import meshy
from meshy import download
A = '/home/claude/models/west/anim/'
CLIPS = {0: 'idle', 11: 'idle1', 12: 'idle2', 243: 'idle3', 244: 'idle4', 36: 'scratch', 56: 'chat', 313: 'talkHandsOpen', 308: 'talkPassionate',
         309: 'talkHandOnHip', 47: 'listen', 25: 'agree', 317: 'shrug', 415: 'sway', 75: 'swingDance', 405: 'joyDance', 403: 'fistPump',
         298: 'cheerBothHands', 385: 'boxingGuard', 290: 'wave'}
PATHS = meshy.PATHS; PATHS['rigging'] = '/v1/rigging'; PATHS['animations'] = '/v1/animations'
glb = open('/home/claude/models/west/chars/parts_v2/sal_preview.glb', 'rb').read()
rid = meshy.create('rigging', {'model_url': 'data:model/gltf-binary;base64,' + base64.b64encode(glb).decode(), 'animation_type': 'biped',
                               'height_meters': 1.66, 'skeleton_template': 'mixamo', 'include_fingers': False})
print('rig task', rid, flush=True)
t = meshy.wait_all({'rig': ('rigging', rid)}, timeout=1200)['rig']
if t['status'] != 'SUCCEEDED': sys.exit('rig failed')
download(t['result']['rigged_character_glb_url'], A + 'sal_rig.glb')
json.dump({'rig_task_id': rid}, open(A + 'rig.json', 'w'))
ids = list(CLIPS)
jobs = {}
for k in range(0, len(ids), 10):
    jobs[f'batch{k // 10}'] = ('animations', meshy.create('animations', {'rig_task_id': rid, 'action_ids': ids[k:k + 10], 'post_process': {'operation_type': 'change_fps', 'fps': 30}}))
done = meshy.wait_all(jobs, timeout=1800)
for name, t in done.items():
    if t['status'] == 'SUCCEEDED':
        download(t['result']['animation_glb_url'], A + f'{name}.glb'); print(name, 'saved', flush=True)
k = 0
json.dump({'batches': [[CLIPS[i] for i in ids[j:j + 10]] for j in range(0, len(ids), 10)], 'ids': ids}, open(A + 'clips.json', 'w'))
