const users = require("../controllers/user.server.controllers");
const { authenticate } = require("../lib/authentication");

module.exports = function(app) {

  // POST /users  - Create a new user account
  // Access: Public
  app.route("/users")
    .post(users.create_account);

  // POST /login  - Authenticate user and issue session token
  // Access: Public
  app.route("/login")
    .post(users.login);

  // POST /logout  - Invalidate session token and log out user
  // Access: Requires authentication
  app.route("/logout")
    .post(authenticate, users.logout);

  // GET /users/:user_id  - Get full profile details for a specific user
  // Access: Public
  app.route("/users/:user_id")
    .get(users.get_user_details);
};