// =================================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET; // Cần thiết cho bảo mật
const MODERATION_MODEL = 'gemini-2.5-flash'; // Đã sửa từ 1.5-flash
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


// --- HÀM HỖ TRỢ: TẢI ẢNH TỪ URL CLOUDINARY VÀ CHUYỂN SANG BASE64 ---
async function urlToBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
             throw new Error(`HTTP error! status: ${response.status}`);
        }
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

// --- HÀM DUYỆT BÀI (TEXT + ẢNH) ---
async function moderateWithAI(post) {
  // 1. Chuẩn bị dữ liệu ảnh (nếu có)
  let imageParts = [];
  if (post.files && post.files.length > 0) {
      console.log(`[Auto-Mod] Đang tải ${post.files.length} ảnh của bài "${post.title}"...`);
      // Lấy tối đa 3 ảnh để tránh timeout
      const promises = post.files.slice(0, 3).map(url => urlToBase64(url)); 
      const results = await Promise.all(promises);
      imageParts = results.filter(img => img !== null); 
  }

  // 2. Chuẩn bị Prompt
  const promptText = `Bạn là Admin kiểm duyệt nội dung Forum. 
  Hãy xem xét CẢ VĂN BẢN và HÌNH ẢNH (nếu có) dưới đây. Trả lời bằng tiếng Việt.

  LUẬT DUYỆT:
  - APPROVE (Duyệt): Nội dung chào hỏi, chia sẻ kiến thức, đời sống, lập trình, ảnh phong cảnh, ảnh đời thường.
  - REJECT (Từ chối): Hình ảnh 18+ (khỏa thân, gợi dục), bạo lực máu me, hoặc nội dung chính trị cực đoan, lừa đảo.

  YÊU CẦU OUTPUT:
  Chỉ trả về duy nhất chuỗi JSON hợp lệ (không markdown, không giải thích thêm):
  {"action": "approve"} 
  hoặc 
  {"action": "reject", "reason": "Lý do ngắn gọn dưới 10 từ"}

  Dữ liệu cần duyệt:
  - Tiêu đề: "${post.title}"
  - Nội dung: "${post.content.substring(0, 1000)}"
  `;

  // 3. Ghép Text và Ảnh vào payload
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

    // === QUAN TRỌNG: KIỂM TRA LỖI API TRƯỚC ===
    if (data.error) {
        console.error(`🔥 LỖI API GEMINI (Bài: ${post.title}):`, JSON.stringify(data.error, null, 2));
        return; 
    }

    let decision = { action: 'approve' }; 
    let hasValidResponse = false;

    // Kiểm tra Candidate
    if (data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];

        // Trường hợp 1: AI từ chối trả lời vì vi phạm Safety
        if (candidate.finishReason === 'SAFETY') {
            console.log(`⚠️ Gemini BLOCKED bài "${post.title}" (Safety Violation).`);
            decision = { action: 'reject', reason: 'Nội dung vi phạm an toàn nghiêm trọng' };
            hasValidResponse = true;
        } 
        // Trường hợp 2: Có nội dung trả về
        else if (candidate.content && candidate.content.parts && candidate.content.parts[0].text) {
            try {
                // Xóa markdown ```json nếu có
                const text = candidate.content.parts[0].text.replace(/```json|```/g, '').trim();
                decision = JSON.parse(text);
                hasValidResponse = true;
            } catch (e) {
                console.log(`⚠️ Lỗi parse JSON bài "${post.title}". Raw text: ${candidate.content.parts[0].text}`);
                // Xử lý lỗi parse: Tạm thời giữ nguyên hoặc Approve
                decision = { action: 'approve' }; 
                hasValidResponse = true;
            }
        }
    }

    if (!hasValidResponse) {
        console.log(`⚠️ Phản hồi không xác định từ Gemini cho bài "${post.title}". Response:`, JSON.stringify(data));
        return; 
    }

    // 4. Lưu kết quả vào Database
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
    console.error('🔥 Lỗi hệ thống khi gọi AI:', err.message);
  }
}

// --- HÀM DỌN DẸP BÀI RÁC ---
async function cleanupRejectedPosts() {
    // ... (Giữ nguyên hàm này) ...
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
        return result.deletedCount;
    } catch (err) {
        console.error('Lỗi dọn dẹp:', err);
        return 0;
    }
}

// =================================================================
// HÀM HANDLER CHÍNH CỦA SERVERLESS FUNCTION
// =================================================================
export default async (req, res) => {
    
    // BƯỚC 1: KIỂM TRA PHƯƠNG THỨC VÀ BẢO MẬT (QUAN TRỌNG)
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const authHeader = req.headers['authorization'];
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid CRON_SECRET' });
    }

    // BƯỚC 2: CHẠY TÁC VỤ DỌN DẸP VÀ KIỂM DUYỆT
    const deletedCount = await cleanupRejectedPosts(); 
    
    try {
        // Lấy bài chưa duyệt
        // Đảm bảo kết nối DB (Mongoose) đã được thiết lập bên ngoài hàm handler.
        const pending = await Post.find({ 
            approved: false, 
            moderatedAt: { $exists: false } 
        }).limit(5); 

        if (pending.length === 0) {
            return res.status(200).json({ message: `Không có bài mới cần duyệt. Đã dọn dẹp ${deletedCount} bài.` });
        }

        console.log(`[CRON] Bắt đầu duyệt ${pending.length} bài...`);

        // Xử lý tuần tự 
        for (const post of pending) {
            await moderateWithAI(post);
        }

        res.status(200).json({ 
            message: `Đã xử lý xong batch ${pending.length} bài.`, 
            processed: pending.length,
            deleted: deletedCount 
        });

    } catch (err) {
        // Lỗi thường do kết nối database
        console.error('🔥 Lỗi cron job FATAL:', err);
        res.status(500).json({ error: 'Lỗi server khi xử lý database hoặc AI.' });
    }
};

