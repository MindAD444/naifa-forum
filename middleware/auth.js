import jwt from 'jsonwebtoken';

const auth = (requiredRole) => async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.split(' ')[1];
  // Fallback to cookie-based token (HttpOnly cookie named 'token')
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = { 
        id: decoded.id, 
        _id: decoded.id,
        username: decoded.username,
        role: decoded.role 
    }; 
    if (requiredRole) {
      if (requiredRole === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Yêu cầu quyền Quản trị viên" });
      }
    }
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Phiên đăng nhập hết hạn' }); 
  }
};

export default auth;