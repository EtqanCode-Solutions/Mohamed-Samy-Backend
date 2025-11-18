// src/middlewares/auth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, code: 'NO_TOKEN', message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = payload; // { id, role, level, iat, exp }
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Token expired',
      });
    }

    return res.status(401).json({
      success: false,
      code: 'TOKEN_INVALID',
      message: 'Invalid token',
    });
  }
}
