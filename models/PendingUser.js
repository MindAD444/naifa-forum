const mongoose = require('mongoose');

const pendingUserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  code: String,
  createdAt: { type: Date, default: Date.now, expires: 600 } // 10 phút
});

module.exports = mongoose.model('PendingUser', pendingUserSchema);	
