import express from 'express';
import Post from '../models/Post.js';
import 'dotenv/config'; 

const router = express.Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
async function urlToBase64(url) {
    try {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type') || "image/jpeg"; 
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        return {
            inlineData: {
                data: buffer.toString('base64'),
                mimeType: contentType
            }
        };
    } catch (error) {
        console.error("Lỗi tải ảnh:", url, error.message);
        return null; 
    }
}
async function moderateWithAI(post) {
  let imageParts = [];
  if (post.files && post.files.length > 0) {
      console.log(`...Đang tải ${post.files.length} ảnh bài "${post.title}"...`);
      const promises = post.files.map(url => urlToBase64(url));
      const results = await Promise.all(promises);
      imageParts = results.filter(img => img !== null); 
  }
  const promptText = `Bạn là Admin kiểm duyệt nội dung Forum. 
  Hãy xem xét CẢ VĂN BẢN và HÌNH ẢNH (nếu có) dưới đây. Trả lời bằng tiếng Việt.

  LUẬT DUYỆT:
  - APPROVE: Nội dung chào hỏi, chia sẻ kiến thức, đời sống, ảnh phong cảnh, ảnh đời thường, ảnh minh họa bài viết.
  - REJECT (Từ chối):
    1. Hình ảnh 18+ (khỏa thân, gợi dục) hoặc bạo lực.
    2. Spam quảng cáo (QR code cờ bạc, logo web đen), lừa đảo tài chính.
    3. Nội dung chính trị cực đoan.
  Trả về duy nhất JSON (Không Markdown, không lời dẫn):
  {"action": "approve"} 
  hoặc 
  {"action": "reject", "reason": "Lý do cụ thể (tối đa 5 từ)"}

  Dữ liệu cần duyệt:
  - Tiêu đề: "${post.title}"
  - Nội dung: "${post.content.substring(0, 1000)}"
  `;
  const requestParts = [{ text: promptText }, ...imageParts];

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: requestParts }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await res.json();
    let decision = { action: 'approve' }; 

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      try {
        const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        decision = JSON.parse(text);
      } catch (e) {
        console.log(`⚠️ Lỗi JSON cho bài "${post.title}" -> Duyệt mặc định.`);
      }
    } else {
        console.log(`⚠️ Gemini BLOCK response bài "${post.title}" -> REJECT vì vi phạm nặng.`);
        decision = { action: 'reject', reason: 'Nội dung/Hình ảnh vi phạm chính sách nghiêm trọng' };
    }
    post.approved = decision.action === 'approve';
    post.moderatedBy = 'AI-Auto';
    post.moderatedAt = new Date();
    
    if (!post.approved) {
        post.rejectionReason = decision.reason || 'Vi phạm tiêu chuẩn cộng đồng';
        console.log(`❌ TỪ CHỐI bài: "${post.title}" | Lý do: ${post.rejectionReason}`);
    } else {
        console.log(`✅ ĐÃ DUYỆT bài: "${post.title}"`);
    }

    await post.save();

  } catch (err) {
    console.error('🔥 Lỗi gọi API Gemini:', err.message);
  }
}
async function cleanupRejectedPosts() {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = await Post.deleteMany({
            approved: false,
            moderatedBy: 'AI-Auto',
            moderatedAt: { $lt: sevenDaysAgo }
        });

        if (result.deletedCount > 0) {
            console.log(`🧹 Đã xóa ${result.deletedCount} bài cũ bị AI từ chối quá 7 ngày.`);
        }
    } catch (err) {
        console.error('Lỗi dọn dẹp:', err);
    }
}
router.get('/run-check', async (req, res) => {
    await cleanupRejectedPosts(); 
    
    try {
        const pending = await Post.find({ 
            approved: false, 
            moderatedAt: { $exists: false } 
        }).limit(5); 

        if (pending.length === 0) {
            return res.status(200).json({ message: "Không có bài mới cần duyệt." });
        }

        console.log(`[CRON] Bắt đầu duyệt ${pending.length} bài...`);
        for (const post of pending) {
            await moderateWithAI(post);
        }

        res.status(200).json({ 
            message: `Hoàn tất duyệt ${pending.length} bài.`, 
            processed: pending.length 
        });

    } catch (err) {
        console.error('Lỗi khi chạy AI check:', err);
        res.status(500).json({ error: 'Lỗi trong quá trình duyệt bài tự động' });
    }
});
let AUTO_MODERATE_ENABLED = false;
router.post('/toggle', (req, res) => {
    AUTO_MODERATE_ENABLED = !AUTO_MODERATE_ENABLED;
    console.log(`AI Tự động duyệt: ${AUTO_MODERATE_ENABLED ? 'BẬT' : 'TẮT'}`);
    res.json({ enabled: AUTO_MODERATE_ENABLED });
});

router.get('/status', (req, res) => res.json({ enabled: AUTO_MODERATE_ENABLED }));

export default router;
