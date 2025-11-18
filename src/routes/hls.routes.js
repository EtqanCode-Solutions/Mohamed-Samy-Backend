// src/routes/hls.routes.js
import { Router } from 'express';
import { verifyPlaybackToken } from '../services/playback-token.js';
import { getLessonKeyBytes } from '../services/keys.js'; // هترجع Buffer للمفتاح

const r = Router();
r.get('/key', async (req, res) => {
  try {
    const { token, kid, lessonId } = req.query;
    if (!token || !kid || !lessonId) return res.sendStatus(400);

    const claims = verifyPlaybackToken(String(token));
    if (String(claims.lessonId) !== String(lessonId)) return res.sendStatus(403);

    // (اختياري) اربط بـ IP/UA/DeviceId لتقليل المشاركة
    // if (claims.deviceId !== hash(req.headers['user-agent']+ip)) return res.sendStatus(403);

    const keyBuf = await getLessonKeyBytes(String(kid));
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(keyBuf);
  } catch {
    res.sendStatus(403);
  }
});

export default r;
