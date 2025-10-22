const db = require("../../database");

//---------------------------------------------------
// Create item
//---------------------------------------------------

// Insert a new item into the items table for controller
exports.createItem = (user_id, item, done) => {
  const sql = `
    INSERT INTO items (name, description, starting_bid, start_date, end_date, creator_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  // Capture the current timestamp as the item's start_date
  const now = Date.now();
  
  // Prepare parameter values for the SQL query
  const params = [item.name, item.description, item.starting_bid, now, item.end_date, user_id];

  // Execute the SQL query with parameters
  db.run(sql, params, function(err) {
    if (err) return done(err);
    done(null, this.lastID);        // On success, return the new item_id
  });
};

//---------------------------------------------------
// Get item details
//---------------------------------------------------

// Get full item details including creator and current bid info for controller
exports.getItem = (item_id, done) => {
  const sql = `
    SELECT 
      i.item_id, i.name, i.description, i.starting_bid, i.start_date, i.end_date,
      i.creator_id, u.first_name, u.last_name,
      COALESCE(b.amount, i.starting_bid) AS current_bid,
      b.user_id AS current_bid_user_id,
      bu.first_name AS current_bid_first_name,
      bu.last_name AS current_bid_last_name
    FROM items i
    JOIN users u ON i.creator_id = u.user_id
    LEFT JOIN (
      SELECT item_id, user_id, amount
      FROM bids
      WHERE item_id = ?
      ORDER BY amount DESC
      LIMIT 1
    ) b ON i.item_id = b.item_id
    LEFT JOIN users bu ON b.user_id = bu.user_id
    WHERE i.item_id = ?
  `;

  // Execute the query with item_id passed twice (for subquery and main WHERE clause)
  db.get(sql, [item_id, item_id], (err, row) => {
    if (err) return done(err);            // Handle error
    if (!row) return done(null, null);    // Item not found

    // Make the structured result object
    const result = {
      item_id: row.item_id,
      name: row.name,
      description: row.description,
      starting_bid: row.starting_bid,
      start_date: row.start_date,
      end_date: row.end_date,
      creator_id: row.creator_id,
      first_name: row.first_name,
      last_name: row.last_name,
      current_bid: row.current_bid,
      current_bid_holder: row.current_bid_user_id
        ? {
            user_id: row.current_bid_user_id,
            first_name: row.current_bid_first_name,
            last_name: row.current_bid_last_name
          }
        : null            // If no bids set to null
    };

    done(null, result);   // return the item details
  });
};

//---------------------------------------------------
// Get item's creator
//---------------------------------------------------

// Retrieve the creator_id of a specific item
exports.getItemCreator = (item_id, done) => {
  const sql = `SELECT creator_id FROM items WHERE item_id = ?`;
  
  // Execute the query with the provided item_id
  db.get(sql, [item_id], (err, row) => {
    if (err) return done(err);              // Pass any database error to the callback
    if (!row) return done(null, null);      // If no item found, return null (not an error)
    done(null, row.creator_id);             // On success, return the creator_id of the item
  });
};

//---------------------------------------------------
// Get current bid
//---------------------------------------------------

// Retrieve the highest bid or fallback to starting bid
exports.getCurrentBid = (item_id, done) => {
  
  // SQL query:
  // - Join items with bids on item_id
  // - Use MAX(b.amount) to get the highest bid
  // - Use COALESCE to fall back to starting_bid if no bids exist
  const sql = `
    SELECT COALESCE(MAX(b.amount), i.starting_bid) AS current_bid
    FROM items i
    LEFT JOIN bids b ON i.item_id = b.item_id
    WHERE i.item_id = ?
  `;

  // Execute the query with the given item_id
  db.get(sql, [item_id], (err, row) => {
    if (err) return done(err);            // Pass any DB error to the callback
    done(null, row.current_bid || 0);     // Return the current bid (or 0 if somehow null, as a final fallback)
  });
};

//---------------------------------------------------
// Place a bid
//---------------------------------------------------

// Insert a new bid into the bids table
exports.placeBid = (item_id, user_id, amount, done) => {
  const sql = `
    INSERT INTO bids (item_id, user_id, amount, timestamp)
    VALUES (?, ?, ?, ?)
  `;

  // Capture the current time as the bid timestamp
  const timestamp = Date.now();

  // Execute the SQL insert with provided values
  db.run(sql, [item_id, user_id, amount, timestamp], function(err) {
    if (err) return done(err);        // Pass error to callback if insertion fails
    done(null);                       // On success, return with no error (bid placed successfully)
  });
};

//---------------------------------------------------
// Get bid history
//---------------------------------------------------

// Retrieve all bids for an item, most recent first
exports.getBidHistory = (item_id, done) => {

  // SQL query:
  // - Join bids with users to include bidder names
  // - Filter bids by item_id
  // - Order results by timestamp most recent first
  const sql = `
    SELECT 
      b.item_id, b.amount, b.timestamp, b.user_id,
      u.first_name, u.last_name
    FROM bids b
    JOIN users u ON b.user_id = u.user_id
    WHERE b.item_id = ?
    ORDER BY b.timestamp DESC
  `;

  // Execute the query and return all matching rows
  db.all(sql, [item_id], (err, rows) => {
    if (err) return done(err);              // Pass any DB error to the callback
    done(null, rows || []);                 // Return bid history (empty array if none)
  });
};

//---------------------------------------------------
// Search items
//---------------------------------------------------

// Search items by keyword, status, and pagination
exports.searchItems = (q, status, user_id, limit, offset, done) => {

  // SQL query:
  // - Select item details and creator's name
  // - Filter by keyword match in name or description
  let sql = `
    SELECT i.item_id, i.name, i.description, i.starting_bid, i.start_date, i.end_date,
           i.creator_id, u.first_name, u.last_name
    FROM items i
    JOIN users u ON i.creator_id = u.user_id
    WHERE (i.name LIKE ? OR i.description LIKE ?)
  `;

  // Keyword search parameters (case-insensitive partial match)
  const params = [`%${q}%`, `%${q}%`];

  // Apply status-specific filters
  if (status === "OPEN") {
    // Show items created by the user that are still active
    sql += " AND i.creator_id = ? AND i.end_date > ?";
    params.push(user_id, Date.now());

  } else if (status === "ARCHIVE") {
    // Show items created by the user that have ended
    sql += " AND i.creator_id = ? AND i.end_date <= ?";
    params.push(user_id, Date.now());

  } else if (status === "BID") {
    // Show items the user has bid on
    sql += `
      AND i.item_id IN (
        SELECT item_id FROM bids WHERE user_id = ?
      )
    `;
    params.push(user_id);

  } else {
    // Default: show all active items (regardless of creator or bidder)
    sql += " AND i.end_date > ?";
    params.push(Date.now());
  }

  // Apply sorting and pagination
  sql += " ORDER BY i.end_date ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  // Execute the query and return results
  db.all(sql, params, (err, rows) => {
    if (err) return done(err);           // Handle DB error
    done(null, rows || []);              // Return results or empty array
  });
};