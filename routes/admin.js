import express from "express";
import Post from "../models/Post.js";
import auth from "../middleware/auth.js";
const router = express.Router();
router.get("/pending", auth("admin"), async (req, res) => {
  try {
    const posts = await Post.find({ approved: false })
      .populate("author", "username")
      .sort("-createdAt");

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server khi tải bài chờ duyệt" });
  }
});
router.put("/approve/:id", auth("admin"), async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { approved: true });
    res.json({ message: "✅ Bài viết đã được duyệt!" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});
router.delete("/reject/:id", auth("admin"), async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "❌ Bài viết đã bị từ chối và xóa!" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;
