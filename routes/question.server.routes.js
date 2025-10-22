const question = require("../controllers/question.server.controllers");
const { authenticate } = require("../lib/authentication");

module.exports = function(app) {

  // GET /item/:item_id/question  - Get all questions asked about a specific item
  // Access: Public
  // POST /item/:item_id/question  - Ask a new question about a specific item
  // Access: Requires authentication
  app.route("/item/:item_id/question")
    .get(question.get_questions)
    .post(authenticate, question.ask_question);


  // POST /question/:question_id  - Submit an answer to a specific question
  // Access: Requires authentication
  app.route("/question/:question_id")
    .post(authenticate, question.answer_question);
};