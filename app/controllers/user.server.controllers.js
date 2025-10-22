const Joi = require("joi");
const User = require("../models/user.server.model");

//---------------------------------------------------
// Joi Validation Schemas
//---------------------------------------------------

// Schema for adding a user
const userSchema = Joi.object({
  first_name: Joi.string().min(1).required(),  // First name must exist and cant be blank
  last_name: Joi.string().min(1).required(),   // Last name must exist and cant be blank
  email: Joi.string().email().required(),      // Must be a valid email type, set by Joi
  password: Joi.string()     
    .min(8)                                    // Min 8 chars
    .max(32)                                   // Max 32 chars
    .pattern(/[A-Z]/, "uppercase")             // Must have one uppercase
    .pattern(/[a-z]/, "lowercase")             // Must have one lowercase
    .pattern(/[0-9]/, "number")                // Must have one number
    .pattern(/[^A-Za-z0-9]/, "special")        // Must have one special char
    .required()                                // Must not be blank
}).strict();                                   // No other fields can exist other than those defined here

// Schema for logging in
const loginSchema = Joi.object({
  email: Joi.string().email().required(),      // Must be a valid email type, set by Joi
  password: Joi.string().required()            // Must be a string and not blank
}).strict();                                   // No other fields to be entered

//---------------------------------------------------
// POST /users
//---------------------------------------------------

const create_account = (req, res) => {

  // Check entry against schema - if wrong tell user in error message
  const { error, value } = userSchema.validate(req.body);
  if (error) return res.status(400).json({ error_message: error.details[0].message });

  // Insert the new user into the database
  User.addNewUser(value, (err, id) => {

    // If the email already exists (unique constraint violation), return 400
    if (err?.code === "SQLITE_CONSTRAINT") {
      return res.status(400).json({ error_message: "Email already exists" });
    }

    // If any other DB error occurs, return 500
    if (err) return res.status(500).json({ error_message: "Database error" });
    res.status(201).json({ user_id: id }); // All good, return the user id
  });
};

//---------------------------------------------------
// POST /login
//---------------------------------------------------

const login = (req, res) => {

  // Validate login entry against schema
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error_message: error.details[0].message });

  // Authenticate user using email and password
  User.authenticateUser(value.email, value.password, (err, user_id) => {
    // If credentials are invalid or user not found, return 400
    if (err === "User not found" || err === "Invalid credentials") {
      return res.status(400).json({ error_message: err });
    }
    if (err) return res.status(500).json({ error_message: "Database error" });

    // Check if user already has a session token
    User.getToken(user_id, (err, token) => {
      if (err) return res.status(500).json({ error_message: "Token error" });

      // If token exists, reuse it
      if (token) return res.status(200).json({ user_id, session_token: token });

      // If no token exists, generate and store a new one
      User.setToken(user_id, (err, newToken) => {
        if (err) return res.status(500).json({ error_message: "Token creation error" });
        res.status(200).json({ user_id, session_token: newToken }); // All good return token to user
      });
    });
  });
};

//---------------------------------------------------
// POST /logout
//---------------------------------------------------

const logout = (req, res) => {
  // Get session token from request headers
  const token = req.headers["x-authorization"];
  // If no token is provided, return 401 Unauthorised
  if (!token) return res.status(401).json({ error_message: "Missing token" });

  // Validate token and get associated user ID
  User.getIDFromToken(token, (err, user_id) => {

    // If token is invalid or lookup fails, return 401 Unauthorised
    if (err || !user_id) return res.status(401).json({ error_message: "Invalid token" });

    // Remove token from database to log the user out
    User.removeToken(token, (err) => {
      if (err) return res.status(500).json({ error_message: "Logout error" });

      // Tell user successful logout
      res.status(200).json({ message: "Logged out" });
    });
  });
};

//---------------------------------------------------
// GET /users/:user_id
//---------------------------------------------------

const get_user_details = (req, res) => {

  // Get user id from the path in URL and check its good ( a number)
  const user_id = parseInt(req.params.user_id);
  if (isNaN(user_id)) return res.status(400).json({ error_message: "Invalid user ID" });

  // Check the database for user details and related auction activity
  User.getUserDetails(user_id, (err, user) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    
    // Is the user found?
    if (!user) return res.status(404).json({ error_message: "User not found" });

    // Yes? Return full user profile including selling, bidding, and ended auctions
    res.status(200).json(user);
  });
};

module.exports = {
  create_account,
  login,
  logout,
  get_user_details
};