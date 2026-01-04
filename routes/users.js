// routes/users.js
import express from 'express';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// === THÊM ROUTE GET ĐỂ LẤY PROFILE CÔNG KHAI ===
router.get('/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const user = await User.findOne({ uuid }).select('-password -email -googleId');
    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }
    res.json({ user });
  } catch (err) {
    console.error('GET /users/:uuid error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT route (giữ nguyên code cũ của bạn)
router.put('/:uuid', auth('user'), async (req, res) => {
  try {
    const { uuid } = req.params;
    const target = await User.findOne({ uuid });
    if (!target) return res.status(404).json({ error: 'Người dùng không tồn tại' });

    if (req.user.role !== 'admin' && req.user.id !== target._id.toString()) {
      return res.status(403).json({ error: 'Bạn không có quyền thay đổi người dùng này' });
    }

    const { username, changeUuid, bio } = req.body;
    const update = {};
    const now = Date.now();

    if (username && username.trim() && username !== target.username) {
      const lastChanged = target.usernameLastChangedAt?.getTime() || target.createdAt.getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (now - lastChanged < sevenDays) {
        return res.status(403).json({ error: 'Cooldown đổi tên: mỗi 7 ngày một lần' });
      }
      update.username = username.trim();
      update.usernameLastChangedAt = now;
      update.$inc = { usernameChangeCount: 1 };
    }

    if (changeUuid === true || changeUuid === '1') {
      const lastUuidChanged = target.uuidLastChangedAt?.getTime() || target.createdAt.getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (now - lastUuidChanged < thirtyDays) {
        return res.status(403).json({ error: 'Cooldown đổi UUID: mỗi 30 ngày một lần' });
      }
      // Bạn cần import generateUniqueUuid nếu dùng
      // update.uuid = await generateUniqueUuid();
      update.uuidLastChangedAt = now;
      update.$inc = { ...(update.$inc || {}), uuidChangeCount: 1 };
    }

    if (bio !== undefined) {
      update.bio = bio.trim();
    }

    if (Object.keys(update).length === 0) {
      return res.json({ message: 'Không có thay đổi' });
    }

    const inc = update.$inc;
    delete update.$inc;
    const updateQuery = { ...update };
    if (inc) updateQuery.$inc = inc;

    const updated = await User.findByIdAndUpdate(target._id, updateQuery, { new: true })
      .select('-password -email -googleId');

    res.json({ user: updated });
  } catch (err) {
    console.error('PUT /users/:uuid error', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

export default router;