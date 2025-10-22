const db = require("../../database");

//---------------------------------------------------
// Get all questions for an item
//---------------------------------------------------

exports.getQuestionsByItem = (item_id, done) => {

  // SQL query:
  // - Select question ID, text, answer, and asker info
  // - Join with users table to get asker's name
  // - Filter by item_id
  // - Order by most recent questions first
  const sql = `
    SELECT q.question_id,
           q.question AS question_text,
           q.answer AS answer_text,
           q.asked_by AS user_id,
           u.first_name,
           u.last_name
    FROM questions q
    JOIN users u ON q.asked_by = u.user_id
    WHERE q.item_id = ?
    ORDER BY q.question_id DESC
  `;

  // Execute the query and return all matching rows
  db.all(sql, [item_id], (err, rows) => {
    if (err) return done(err);          // Handle any errors
    done(null, rows || []);             // Return results or empty array
  });
};

//---------------------------------------------------
// Ask a question
//---------------------------------------------------

exports.askQuestion = (item_id, user_id, question_text, done) => {

  // SQL query to insert a new question with item reference and asker ID
  const sql = `
    INSERT INTO questions (item_id, asked_by, question)
    VALUES (?, ?, ?)
  `;

  // Execute the SQL insert with provided values
  db.run(sql, [item_id, user_id, question_text], function(err) {
    if (err) return done(err);
    done(null, this.lastID);  // On success, return the ID of the new question asked
  });
};

//---------------------------------------------------
// Answer a question
//---------------------------------------------------

exports.answerQuestion = (question_id, answer_text, done) => {

  // SQL query to update the 'answer' field for the specified question
  const sql = `
    UPDATE questions
    SET answer = ?
    WHERE question_id = ?
  `;

  // Execute the update with provided answer text and question ID
  db.run(sql, [answer_text, question_id], function(err) {
    if (err) return done(err);    // Pass error back if fail
    done(null);                   // On success, return with no error (answer saved)
  });
};

//---------------------------------------------------
// Get item and creator for a question
//---------------------------------------------------

exports.getQuestionItemAndCreator = (question_id, done) => {

  // SQL query:
  // - Join questions with items to get the item's creator
  // - Filter by question_id to locate the specific question
  const sql = `
    SELECT q.item_id, i.creator_id
    FROM questions q
    JOIN items i ON q.item_id = i.item_id
    WHERE q.question_id = ?
  `;

  // Execute the query with the provided question ID
  db.get(sql, [question_id], (err, row) => {
    if (err) return done(err);
    done(null, row);                        // Return result or null if not found
  });
};