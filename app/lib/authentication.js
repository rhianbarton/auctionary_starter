const User = require("../models/user.server.model");

//---------------------------------------------------
// Strict authentication middleware
// Blocks access if token is missing or invalid
//---------------------------------------------------

const authenticate = (req, res, next) => {
  // Get token from request headers
  const token = req.headers["x-authorization"];

  // If no token is provided, reject with 401 Unauthorised
  if (!token) {
    return res.status(401).json({ error_message: "Missing token" });
  }

  // Validate token and get associated user ID
  User.getIDFromToken(token, (err, user_id) => {
    if (err || !user_id) {
      return res.status(401).json({ error_message: "Invalid token" });
    }

    // Attach user ID to request object and keep going
    req.user_id = user_id;
    next();
  });
};

//-----------------------------------------------------------
// Optional authentication middleware
// Attaches user_id if token is valid, but never blocks access
//------------------------------------------------------------

const optionalAuth = (req, res, next) => {
  // Get token from request headers
  const token = req.headers["x-authorization"];

  // If no token is provided, keep going anonymously
  if (!token) return next(); 

  // Validate token and attach user ID if valid
  User.getIDFromToken(token, (err, user_id) => {
    if (!err && user_id) {
      req.user_id = user_id;
    }
    next(); // Keep going even if token is invalid
  });
};

module.exports = {
  authenticate,
  optionalAuth
};