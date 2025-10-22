const Joi = require("joi");
const question = require("../models/question.server.model");
const core = require("../models/core.server.model");

//---------------------------------------------------
// Joi Validation Schemas
//---------------------------------------------------

// Schema for asking a question
const questionSchema = Joi.object({
  question_text: Joi.string().min(1).required()       // Must be entered and not blank
}).strict();                                          // No othe fields allowed

// Schema for answering a question
const answerSchema = Joi.object({
  answer_text: Joi.string().min(1).required()         // Must be entered and not blank
}).strict();                                          // No other fields allowed

//---------------------------------------------------
// GET /item/:item_id/question
//---------------------------------------------------

// Get all questions for a specific item
const get_questions = (req, res) => {
  const item_id = parseInt(req.params.item_id);

  // Make sure item id exists (is a number)
  if (isNaN(item_id)) return res.status(400).json({ error_message: "Invalid item ID" });

  // Ensure item exists before getting questions
  core.getItemDetails(item_id, (err, item) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    if (!item) return res.status(404).json({ error_message: "Item not found" });

    // Get questions for each item
    question.getQuestionsByItem(item_id, (err, questions) => {
      if (err) return res.status(500).json({ error_message: "Server error" });
      res.status(200).json(questions || []); // Return the list of questions (empty array if none)
    });
  });
};

//---------------------------------------------------
// POST /item/:item_id/question
//---------------------------------------------------

// Ask a question about an item
const ask_question = (req, res) => {

  // Make sure user is authenticated
  if (!req.user_id) return res.status(401).json({ error_message: "Unauthorised" });

  // Make sure item id from URL is good
  const item_id = parseInt(req.params.item_id);
  if (isNaN(item_id)) return res.status(400).json({ error_message: "Invalid item ID" });

  // Validate request body against question schema (e.g. question_text must not be blank and valid)
  const { error, value } = questionSchema.validate(req.body);
  if (error) return res.status(400).json({ error_message: error.details[0].message });

  // Ensure item exists and user is not the seller
  core.getItemDetails(item_id, (err, item) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    if (!item) return res.status(404).json({ error_message: "Item not found" });
    if (item.creator_id === req.user_id) {
      return res.status(403).json({ error_message: "You cannot ask a question on your own item" });
    }

    // Insert the question into the database
    question.askQuestion(item_id, req.user_id, value.question_text, (err, question_id) => {
      if (err) return res.status(500).json({ error_message: "Server error" });
      res.status(200).json({ question_id });  // Respond with the new question ID
    });
  });
};

//---------------------------------------------------
// POST /question/:question_id
//---------------------------------------------------

// Answer a question
const answer_question = (req, res) => {

  //Make sure user is authenticated
  if (!req.user_id) return res.status(401).json({ error_message: "Unauthorised" });

  // Make sure item id from URL is good
  const question_id = parseInt(req.params.question_id);
  if (isNaN(question_id)) return res.status(400).json({ error_message: "Invalid question ID" });

  // Validate request body against answer schema (e.g. answer_text must be valid)
  const { error, value } = answerSchema.validate(req.body);
  if (error) return res.status(400).json({ error_message: error.details[0].message });

  // Ensure question exists and user is the seller
  question.getQuestionItemAndCreator(question_id, (err, row) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    if (!row) return res.status(404).json({ error_message: "Question not found" });
    if (row.creator_id !== req.user_id) {
      return res.status(403).json({ error_message: "Only the item's seller can answer questions" });
    }
   
    // Update answer
    question.answerQuestion(question_id, value.answer_text, (err) => {
      if (err) return res.status(500).json({ error_message: "Server error" });
      res.status(200).json({ message: "Answer submitted" });  // Tell user successful
    });
  });
};

module.exports = {
  get_questions,
  ask_question,
  answer_question
};