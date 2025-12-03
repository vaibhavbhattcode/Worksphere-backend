// models/Search.js
import mongoose from "mongoose";

const searchSchema = new mongoose.Schema({
  query: { type: String, required: true, index: true },
  // If you have user authentication, you can store the user ID.
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

searchSchema.index({ query: 1, createdAt: -1 }); // For search analytics
searchSchema.index({ user: 1, createdAt: -1 }); // For user search history

const Search = mongoose.model("Search", searchSchema);

export default Search;
