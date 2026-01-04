// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  // Display name (may be non-unique and editable)
  username: { type: String, required: true },
  // Make email index sparse so multiple documents with null/undefined email don't conflict
  email: { type: String, unique: true, sparse: true },
  password: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  avatar: { 
    type: String, 
    default: "https://cdn.britannica.com/99/236599-050-1199AD2C/Mark-Zuckerberg-2019.jpg" 
  },
  // UUID identifier — this is the primary public identifier and must be unique
  uuid: { type: String, required: true, unique: true, index: true },
  uuidLastChangedAt: { type: Date, default: Date.now },
  uuidChangeCount: { type: Number, default: 0 },
  // Username change tracking (allow frequent name changes policy handled in routes)
  usernameLastChangedAt: { type: Date, default: Date.now },
  usernameChangeCount: { type: Number, default: 0 },
  bio: { type: String, default: '' },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },
  // ----------------------

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("User", userSchema);