// src/services/playback-token.js
import jwt from 'jsonwebtoken';

export function mintPlaybackToken({ userId, lessonId, deviceId }) {
  const payload = { sub: String(userId), lessonId, deviceId, v: 1 };
  const opts = { expiresIn: '10m', issuer: 'etqan' };
  return jwt.sign(payload, process.env.PLAYBACK_SECRET, opts);
}

export function verifyPlaybackToken(token) {
  return jwt.verify(token, process.env.PLAYBACK_SECRET, { issuer: 'etqan' });
}
