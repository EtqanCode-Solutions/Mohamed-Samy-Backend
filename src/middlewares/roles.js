// src/middlewares/roles.js
export function requireRole(...allowed) {
  return (req, res, next) => {
    // نفترض أن الـJWT يضع role داخل req.user.role (كما تفعلون للطالب)
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ success: false, message: 'غير مصرح' });
    }
    next();
  };
}
