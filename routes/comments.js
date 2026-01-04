import express from "express";
import Comment from "../models/Comment.js";
import User from "../models/User.js";

import auth from "../middleware/auth.js";
import mongoose from "mongoose";

const router = express.Router();

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

router.get("/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!isValidObjectId(postId)) {
      return res.status(400).json({ error: "postId không hợp lệ" });
    }

    const skip = (page - 1) * limit;

    // Return only top-level (root) comments and include total descendant replies count for lazy-loading
    // Use aggregation with $graphLookup to compute descendant counts per root in a single pipeline
    const rootsAgg = await Comment.aggregate([
      { $match: { post: new mongoose.Types.ObjectId(postId), parent: null } },
      { $sort: { createdAt: 1 } },
      { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' } },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      { $graphLookup: {
        from: 'comments',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parent',
        as: 'descendants',
        restrictSearchWithMatch: { post: new mongoose.Types.ObjectId(postId) }
      } },
      { $addFields: { repliesCount: { $size: '$descendants' } } },
      { $project: { descendants: 0 } }
    ]);

    // Normalize author and fields to match populated shape
    const results = rootsAgg.map(r => ({
      _id: r._id,
      post: r.post,
      content: r.content,
      parent: r.parent,
      depth: r.depth,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      author: r.author ? { _id: r.author._id, username: r.author.username, uuid: r.author.uuid, avatar: r.author.avatar } : null,
      repliesCount: r.repliesCount || 0
    }));

    res.json({ comments: results });

  } catch (err) {
    console.error("GET /comments error:", err);
    res.status(500).json({ error: "Lỗi server khi tải bình luận" });
  }
});

router.post("/:postId", auth("user"), async (req, res) => {
  try {
    const postId = req.params.postId;
    const { content, parent } = req.body;

    if (!isValidObjectId(postId)) {
      return res.status(400).json({ error: "ID bài viết không hợp lệ" });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Nội dung bình luận không được để trống" });
    }

    // Extract mentions in the format @username (case-insensitive)
    const rawMentions = Array.from(new Set((content.match(/@([a-zA-Z0-9_\-\.]+)/g) || []).map(m => m.slice(1))));
    let mentionIds = [];
    if (rawMentions.length > 0) {
      const User = (await import('../models/User.js')).default;
      // Build case-insensitive regex queries for each username
      const or = rawMentions.map(u => ({ username: new RegExp(`^${u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`, 'i') }));
      const users = await User.find({ $or: or }).select('_id');
      mentionIds = users.map(u => u._id);
    }

    // Determine depth: if parent provided, lookup parent depth
    let depth = 1;
    let parentId = parent && isValidObjectId(parent) ? parent : null;
    if (parentId) {
      const parentComment = await Comment.findById(parentId).populate('author', 'uuid');
      if (parentComment) {
        // Normal case: new depth would be parent.depth + 1
        depth = (parentComment.depth || 1) + 1;
        // If parent is already at max depth (3), instead create a sibling at the same depth
        if (parentComment.depth >= 3) {
          // prepend mention in content (avoid duplication)
          const mentionToken = `@${parentComment.author?.uuid || ''}`;
          const trimmed = content.trim();
          const finalContent = trimmed.startsWith(mentionToken) ? trimmed : `${mentionToken} ${trimmed}`;
          const mUser = await User.findById(parentComment.author?._id).select('_id');
          if (mUser) mentionIds.push(mUser._id);

          // Make the new comment a sibling: use the same parent as the target comment's parent
          parentId = parentComment.parent ? parentComment.parent.toString() : null;

          // Keep depth equal to the target comment's depth (so it's at the same level)
          depth = parentComment.depth;

          // override content
          req.body.content = finalContent;
        }
      }
    }

    const newComment = await Comment.create({
      post: postId,
      author: req.user._id,
      content: req.body.content.trim(),
      parent: parentId,
      mentions: mentionIds,
      depth
    });

    await newComment.populate("author", "username uuid avatar");

    res.status(201).json(newComment);

  } catch (err) {
    console.error("POST /comments error:", err);
    res.status(500).json({ error: "Lỗi server khi tạo bình luận" });
  }
});

// GET direct replies for a comment (lazy-load)
router.get('/:postId/replies/:commentId', async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    if (!isValidObjectId(postId) || !isValidObjectId(commentId)) return res.status(400).json({ error: 'ID không hợp lệ' });

    // Use aggregation to get direct replies and include total descendant counts per reply
    const repliesAgg = await Comment.aggregate([
      { $match: { post: new mongoose.Types.ObjectId(postId), parent: new mongoose.Types.ObjectId(commentId) } },
      { $sort: { createdAt: 1 } },
      { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' } },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      { $graphLookup: {
        from: 'comments',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parent',
        as: 'descendants',
        restrictSearchWithMatch: { post: new mongoose.Types.ObjectId(postId) }
      } },
      { $addFields: { repliesCount: { $size: '$descendants' } } },
      { $project: { descendants: 0 } }
    ]);

    const results = repliesAgg.map(r => ({
      _id: r._id,
      post: r.post,
      content: r.content,
      parent: r.parent,
      depth: r.depth,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      author: r.author ? { _id: r.author._id, username: r.author.username, uuid: r.author.uuid, avatar: r.author.avatar } : null,
      repliesCount: r.repliesCount || 0
    }));

    res.json({ replies: results });
  } catch (err) {
    console.error('GET replies error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

router.delete("/:commentId", auth("user"), async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!isValidObjectId(commentId)) {
      return res.status(400).json({ error: "ID bình luận không hợp lệ" });
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(404).json({ error: "Bình luận không tồn tại." });
    }

    const isOwner = comment.author.toString() === req.user._id.toString();

    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ error: "Bạn không có quyền xóa bình luận này" });
    }

    // Cascade delete: remove the comment and all its descendant replies
    const toDelete = [commentId];
    for (let i = 0; i < toDelete.length; i++) {
      const parentIds = toDelete.slice(i).map(id => new mongoose.Types.ObjectId(id));
      const children = await Comment.find({ parent: { $in: parentIds } }).select('_id').lean();
      children.forEach(c => toDelete.push(c._id.toString()));
    }
    await Comment.deleteMany({ _id: { $in: toDelete.map(id => new mongoose.Types.ObjectId(id)) } });
    res.json({ message: "Đã xóa bình luận và các trả lời liên quan" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;
