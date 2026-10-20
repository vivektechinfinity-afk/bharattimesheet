const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const EXPIRY = process.env.JWT_EXPIRY || '7d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    SECRET,
    { expiresIn: EXPIRY }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired, login again' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { generateToken, authenticate, requireRole, SECRET };
