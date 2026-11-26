# name: (female, game height, overrides). Models: Meshy 6 remakes (25 Nov 2026); the meshy-t2.5 originals are in raw3d_t25/ with west_char_cast_t25.py
CAST = {
 'sal': (0, 1.03, {'mouthShade': 0.35, 'mouthY': -0.096, 'eyeY': -0.035, 'pitch': 0.14}),
 'dee': (1, 0.98, {'mouthY': -0.08, 'eyeY': -0.03}),
 'mick': (0, 1.12, {'mouthShade': 0.35, 'mouthY': -0.142, 'eyeY': -0.088}),
 'rose': (1, 0.97, {'skirt': True, 'mouthY': -0.066, 'eyeY': -0.012}),
 'tiny': (0, 1.0, {'mouthShade': 0.35, 'mouthY': -0.178, 'eyeY': -0.108, 'eyeX': 0.027}),
 'doug': (0, 1.04, {'mouthY': -0.099, 'eyeY': -0.043}),
 'sharkey': (0, 1.06, {'mouthShade': 0.35, 'skirt': True, 'mouthY': -0.124, 'eyeY': -0.062}),
 'fergus': (0, 1.02, {'mouthShade': 0.35, 'mouthY': -0.19, 'eyeY': -0.133}),
 'shark': (0, 1.05, {'mouthShade': 0.35, 'mouthY': -0.075, 'eyeY': -0.02, 'eyeX': 0.027}),
 'nadia': (1, 0.98, {'mouthY': -0.088, 'eyeY': -0.032, 'eyeX': 0.026, 'eyeMidX': -0.0035}),
 'earl': (0, 0.97, {'mouthShade': 0.35, 'mouthY': -0.116, 'eyeY': -0.048}),
 'marge': (1, 0.95, {'mouthY': -0.098, 'eyeY': -0.042}),
 'lou': (0, 1.0, {'mouthY': -0.085, 'eyeY': -0.028}),
 'benny': (0, 1.0, {'mouthY': -0.081, 'eyeY': -0.028}),
 'vic': (0, 1.02, {'mouthShade': 0.35, 'mouthY': -0.107, 'eyeY': -0.04}),
 'pearl': (1, 0.96, {'mouthY': -0.074, 'eyeY': -0.024}),
 'rudy': (0, 0.99, {'mouthShade': 0.35, 'mouthY': -0.126, 'eyeY': -0.072}),
 'gus': (0, 1.0, {'mouthShade': 0.35, 'mouthY': -0.145, 'eyeY': -0.08}),
 'nell': (1, 0.94, {'skirt': True, 'mouthY': -0.093, 'eyeY': -0.041}),
 'frank': (0, 1.03, {'skirt': True, 'mouthY': -0.098, 'eyeY': -0.036}),
}
ROLES = {'sal': 'Old prospector', 'dee': 'Saloon keeper', 'mick': 'Burly cowhand', 'rose': 'Saloon singer', 'tiny': 'Ranch hand',
 'doug': 'Ranch hand', 'sharkey': 'Ranch hand', 'fergus': 'Buffalo hunter', 'shark': 'Gambler', 'nadia': 'Railroad surveyor',
 'earl': 'Old-timer', 'marge': 'Landlady', 'lou': 'Card dealer', 'benny': 'Stable hand', 'vic': 'Deputy', 'pearl': 'Lady gambler',
 'rudy': 'Chuckwagon cook', 'gus': 'Banker', 'nell': 'Waitress', 'frank': 'Undertaker'}
if __name__ == '__main__':
    import json, subprocess, sys
    names = sys.argv[1:] or list(CAST)
    for n in names:
        f, h, ov = CAST[n]
        r = subprocess.run(['python3', '/home/claude/scripts/west_char_rig.py', n, str(f), json.dumps(ov)], capture_output=True, text=True)
        print(n, [l for l in r.stdout.splitlines() if 'scale' in l], r.stderr[-300:])
