const crypto = require("crypto");
const db = require("../../database");


// Generate a SHA-256 hash of the password combined with a salt
function getHash(password, salt) {
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

//---------------------------------------------------
// Create a new user account
//---------------------------------------------------

exports.addNewUser = (user, done) => {
  const salt = crypto.randomBytes(16).toString("hex");     // Generate a random salt
  const hash = getHash(user.password, salt);               // Hash the password with the salt
  const sql = `
    INSERT INTO users (first_name, last_name, email, password, salt)
    VALUES (?, ?, ?, ?, ?)
  `;

  // Insert user into the database with hashed password and salt
  db.run(sql, [user.first_name, user.last_name, user.email, hash, salt], function(err) {
    if (err) return done(err);
    done(null, this.lastID);      // All good, return new user_id
  });
};

//---------------------------------------------------
// Authenticate user 
//---------------------------------------------------

exports.authenticateUser = (email, password, done) => {
  const sql = `SELECT * FROM users WHERE email = ?`;

  // Does the user exist?
  db.get(sql, [email], (err, user) => {
    if (err) return done(err);
    if (!user) return done("User not found");

    // Re-hash input password with stored salt
    const hash = getHash(password, user.salt);     
    if (hash !== user.password) return done("Invalid credentials");

    done(null, user.user_id);  // Return user ID 
  });
};

//---------------------------------------------------
// Get the session token for a user
//---------------------------------------------------

exports.getToken = (id, done) => {
  db.get(`SELECT session_token FROM users WHERE user_id = ?`, [id], (err, row) => {
    if (err) return done(err);
    done(null, row?.session_token || null);   // Return token or null if not set
  });
};

//---------------------------------------------------
// Generate and store a new session token
//---------------------------------------------------

exports.setToken = (id, done) => {
  // Generate secure random token
  const token = crypto.randomBytes(32).toString("hex");

  db.run(`UPDATE users SET session_token = ? WHERE user_id = ?`, [token, id], function(err) {
    if (err) return done(err);
    done(null, token);  // Return the new token

  });
};


//---------------------------------------------------
// Logout - Invalidate a session token 
//---------------------------------------------------

exports.removeToken = (token, done) => {
  db.run(`UPDATE users SET session_token = NULL WHERE session_token = ?`, [token], function(err) {
    if (err) return done(err);
    done(null);    // Confirm token removal
  });
};


//---------------------------------------------------
// Get user ID from a session token
//---------------------------------------------------

exports.getIDFromToken = (token, done) => {
  db.get(`SELECT user_id FROM users WHERE session_token = ?`, [token], (err, row) => {
    if (err) return done(err);
    if (!row) return done("Invalid token");
    done(null, row.user_id);         // Return user ID if token is valid
  });
};

//----------------------------------------------------------------
// Get full user profile with selling, bidding, and ended auctions
//-----------------------------------------------------------------

exports.getUserDetails = (user_id, done) => {
  const sql_user = `
    SELECT user_id, first_name, last_name
    FROM users
    WHERE user_id = ?
  `;

  const sql_selling = `
    SELECT i.item_id, i.name, i.description, i.end_date,
           i.creator_id, u.first_name, u.last_name
    FROM items i
    JOIN users u ON i.creator_id = u.user_id
    WHERE i.creator_id = ? AND i.end_date > ?
    ORDER BY i.start_date DESC
  `;

  const sql_ended = `
    SELECT i.item_id, i.name, i.description, i.end_date,
           i.creator_id, u.first_name, u.last_name
    FROM items i
    JOIN users u ON i.creator_id = u.user_id
    WHERE i.creator_id = ? AND i.end_date <= ?
    ORDER BY i.end_date DESC
  `;

  const sql_bidding = `
    SELECT DISTINCT i.item_id, i.name, i.description, i.end_date,
           i.creator_id, u.first_name, u.last_name
    FROM bids b
    JOIN items i ON b.item_id = i.item_id
    JOIN users u ON i.creator_id = u.user_id
    WHERE b.user_id = ?
    ORDER BY b.timestamp DESC
  `;

  // Get the timestamp for now
  const now = Date.now();

  // Get basic user info
  db.get(sql_user, [user_id], (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, null);

    // Get active listings (selling)
    db.all(sql_selling, [user_id, now], (err, selling) => {
      if (err) return done(err);

      // Get ended listings (auctions_ended)
      db.all(sql_ended, [user_id, now], (err, ended) => {
        if (err) return done(err);

        // Get items the user has bid on (bidding_on)
        db.all(sql_bidding, [user_id], (err, bidding) => {
          if (err) return done(err);

          // Attach all sections to the user object
          user.selling = selling || [];
          user.bidding_on = bidding || [];
          user.auctions_ended = ended || [];

          done(null, user);  // Return full user profile
        }); 
      });
    });
  });
};