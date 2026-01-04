import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Chưa đăng nhập" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    // --- KIỂM TRA ROLE LÀ ADMIN ---
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Không có quyền quản trị" });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token không hợp lệ" });
  }
};