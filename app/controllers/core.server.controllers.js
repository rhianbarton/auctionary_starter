const Joi = require("joi");
const core = require("../models/core.server.model");

//---------------------------------------------------
// Joi Validation Schemas
//---------------------------------------------------

// Schema for creating an item
const itemSchema = Joi.object({
  name: Joi.string().min(1).required(),              // Item name must be entered and not blank
  description: Joi.string().min(1).required(),       // Same with description 
  starting_bid: Joi.number().positive().required(),  // Bid has to be a positive number and not blank
  end_date: Joi.number()                             // End date has to be an integer (converted by front end)
    .integer()
    .min(Date.now() + 1000) // must be in the future
    .required()
    .messages({
      "number.min": "End date must be in the future"
    })
}).strict().options({ convert: true });              // Must only be these fields, any numbers in strings converted

// Schema for placing a bid
const bidSchema = Joi.object({
  amount: Joi.number().positive().required()         // Amount must be a positive number
}).strict();                                         // No other fields allowed

//---------------------------------------------------
// POST /item
//---------------------------------------------------

const create_item = (req, res) => {
  const { error, value } = itemSchema.validate(req.body);
  if (error) return res.status(400).json({ error_message: error.details[0].message });

  const endDate = value.end_date;

  // Must be a valid timestamp in the future
  if (typeof endDate !== "number" || endDate <= Date.now()) {
    return res.status(400).json({ error_message: "End date must be a future Unix timestamp" });
  }

  // If all good create the item and return the item_id it got
  core.createItem(req.user_id, { ...value, end_date: endDate }, (err, item_id) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    res.status(201).json({ item_id });
  });
};

//---------------------------------------------------
// GET /item/:item_id
//---------------------------------------------------

const get_item = (req, res) => {
  const item_id = parseInt(req.params.item_id);
  
  // Does the item id entered exist? (Is it a number)
  if (isNaN(item_id)) return res.status(400).json({ error_message: "Invalid item ID" });

  // Find the item
  core.getItem(item_id, (err, item) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    if (!item) return res.status(404).json({ error_message: "Item not found" });
    res.status(200).json(item);   // All good return item details to user
  });
};

//---------------------------------------------------
// POST /item/:item_id/bid
//---------------------------------------------------

const place_bid = (req, res) => {
  const item_id = parseInt(req.params.item_id);

  // Does the item id entered exist? (Is it a number)
  if (isNaN(item_id)) return res.status(400).json({ error_message: "Invalid item ID" });

  // Validate request body against bid schema (e.g. amount must be a number > 0)
  const { error, value } = bidSchema.validate(req.body);
  if (error) return res.status(400).json({ error_message: error.details[0].message });

  // Need to get the user who made the item as dont want someone to bid on something they are selling
  core.getItemCreator(item_id, (err, creator_id) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    if (!creator_id) return res.status(404).json({ error_message: "Item not found" });
    if (creator_id === req.user_id) {
      return res.status(403).json({ error_message: "You cannot bid as the seller on this item" });
    }

    // Check the amount bidding is greater than the starting/current  bid
    core.getCurrentBid(item_id, (err, current_bid) => {
      if (err) return res.status(500).json({ error_message: "Server error" });
      if (value.amount <= current_bid) {
        return res.status(400).json({ error_message: "Bid must be higher than current bid" });
      }

      // Place the bid if all good up to here
      core.placeBid(item_id, req.user_id, value.amount, (err) => {
        if (err) return res.status(500).json({ error_message: "Server error" });
        res.status(201).json({ message: "Bid received" });
      });
    });
  });
};

//---------------------------------------------------
// GET /item/:item_id/bid
//---------------------------------------------------

const get_bids = (req, res) => {
  const item_id = parseInt(req.params.item_id);
  if (isNaN(item_id)) return res.status(400).json({ error_message: "Invalid item ID" });

  // Find theh item first
  core.getItem(item_id, (err, item) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    if (!item) return res.status(404).json({ error_message: "Item not found" });

    // Then look at what the bids are on it and return to user
    core.getBidHistory(item_id, (err, bids) => {
      if (err) return res.status(500).json({ error_message: "Server error" });
      res.status(200).json(bids || []);
    });
  });
};

//---------------------------------------------------
// GET /search
//---------------------------------------------------

const search_items = (req, res) => {
   // Extract query parameters with defaults
  const q = req.query.q || "";                     // Free-text search string                
  const status = req.query.status || null;         // Optional status filter (OPEN, BID, ARCHIVE)
  const limit = parseInt(req.query.limit) || 10;   // Max number of items to return
  const offset = parseInt(req.query.offset) || 0;  // Pagination offset

  // Define allowed status values
  const validStatuses = ["OPEN", "BID", "ARCHIVE"];

  // Reject request if status is provided but not valid
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error_message: "Invalid status" });
  }

  // Require authentication if filtering by status
  // This ensures users can't view status-specific data without logging in
  if (status && !req.user_id) {
    return res.status(400).json({ error_message: "Authentication required for status filter" });
  }

  // Pass all relevant filters to core model and return search results (or empty array if none)
  core.searchItems(q, status, req.user_id, limit, offset, (err, items) => {
    if (err) return res.status(500).json({ error_message: "Server error" });
    res.status(200).json(items || []);
  });
};

module.exports = {
  create_item,
  get_item,
  place_bid,
  get_bids,
  search_items
};