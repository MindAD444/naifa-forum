import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Cấu hình SendGrid SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net', // Host SMTP của SendGrid
  port: 587, // Port tiêu chuẩn cho STARTTLS
  secure: false, // Bắt buộc là FALSE khi dùng Port 587 (STARTTLS)
  auth: {
    // Tên đăng nhập CỐ ĐỊNH cho SendGrid SMTP là 'apikey'
    user: 'apikey', 
    // Mật khẩu là API Key bạn đã tạo (từ biến môi trường)
    pass: process.env.SG_API_KEY, 
  },
});

export const sendMail = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_SENDER, 
    to: email,
    subject: 'Mã xác thực đăng ký Forum',
    html: `
      <h2>Xác thực đăng ký tài khoản</h2>
      <p>Mã xác thực (OTP) của bạn là:</p>
      <h1 style="color: #007bff; font-size: 30px; letter-spacing: 3px;">${code}</h1>
      <p>Mã này sẽ hết hạn trong 10 phút.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

