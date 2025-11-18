// src/middlewares/soft-auth.js
import jwt from 'jsonwebtoken';

export default function softAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(); // بدون مصادقة، نكمّل عادي

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = payload; // { id, role, level, iat, exp }
    return next();
  } catch {
    // لو في مشكلة توكن، نتجاهل ونكمّل (ما نعملش 401)
    return next();
  }
}
