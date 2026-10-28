import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine } from './engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';
const engine = new Engine({
  rtp: process.env.RTP ? Number(process.env.RTP) : undefined,
  startingBalance: process.env.STARTING_BALANCE ? Number(process.env.STARTING_BALANCE) : 1000,
});

const app = express();
app.use(express.json());

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

app.get('/api/config', wrap(() => engine.config()));
app.post('/api/session', wrap((req) => engine.createSession(req.body?.clientSeed)));
app.get('/api/session/:id', wrap((req) => engine.publicSession(engine.getSession(req.params.id))));
app.post('/api/session/:id/rotate', wrap((req) => engine.rotateSeed(req.params.id, req.body?.clientSeed)));
app.get('/api/session/:id/history', wrap((req) => engine.history(req.params.id)));
app.post('/api/session/:id/topup', wrap((req) => engine.topUp(req.params.id, 1000)));

app.post('/api/round/start', wrap((req) => engine.startRound(req.body.sessionId, req.body.gameId, req.body.stake)));
app.post('/api/round/step', wrap((req) => engine.step(req.body.sessionId, req.body.roundId)));
app.post('/api/round/cashout', wrap((req) => engine.cashout(req.body.sessionId, req.body.roundId)));
app.post('/api/round/finish', wrap((req) => engine.finish(req.body.sessionId, req.body.roundId)));

// Operator endpoint: change the RTP live. All new rounds use the new value.
app.post('/api/admin/rtp', wrap((req) => {
  if (req.get('x-admin-key') !== ADMIN_KEY) { const e = new Error('forbidden'); e.status = 403; throw e; }
  return { rtp: engine.setRtp(req.body.rtp) };
}));

// Production: serve the built PWA.
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Fox and Fiddle outcome server on http://localhost:${PORT} (RTP ${engine.rtp})`);
});
