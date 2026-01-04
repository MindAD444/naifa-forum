import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  title: String,
  content: String,
  files: [String],
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  moderatedBy: { type: String },        // "AI-Auto" hoặc "Admin"
  moderatedAt: { type: Date },
  rejectionReason: { type: String },
});

export default mongoose.model('Post', postSchema);

