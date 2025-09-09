import nodemailer from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// 创建邮件传输器（延迟初始化）
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, text, html }: EmailOptions) {
  const transporter = getTransporter();

  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || "Blog"}" <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.response}`);
    return info;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw new Error("Failed to send email");
  }
}

export function generateVerificationEmailHTML(code: string): string {
  return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #333;">您的验证码</h2>
        <p>您好！</p>
        <p>感谢您使用我们的留言功能。您的临时登录验证码是：</p>
        <p style="font-size: 24px; font-weight: bold; color: #444; letter-spacing: 2px; border: 1px solid #ddd; padding: 10px 15px; display: inline-block;">
          ${code}
        </p>
        <p>此验证码将在 10 分钟内过期。请勿与他人分享。</p>
        <p>如果您没有请求此验证码，请忽略此邮件。</p>
        <p>祝好！<br>博客团队</p>
      </div>
    `;
}

export function generateAdminNotificationEmailHTML(
  commentContent: string,
  postSlug: string,
  authorName: string,
  authorEmail: string
): string {
  const siteUrl = process.env.SITE_URL || "http://localhost:25090";
  const postUrl = `${siteUrl}/blog/${postSlug}`;
  const adminUrl = `${siteUrl}/admin/comments`;

  return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #333;">新评论通知</h2>
        <p>您好，管理员！</p>
        <p>您的博客收到了一条新评论：</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007cba; margin: 20px 0;">
          <p><strong>作者：</strong> ${authorName} (${authorEmail})</p>
          <p><strong>文章：</strong> <a href="${postUrl}" style="color: #007cba;">${postSlug}</a></p>
          <p><strong>评论内容：</strong></p>
          <div style="background-color: white; padding: 10px; border-radius: 4px; margin-top: 10px;">
            ${commentContent.replace(/\n/g, "<br>")}
          </div>
        </div>
        
        <p>
          <a href="${adminUrl}" style="background-color: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            前往管理后台处理
          </a>
        </p>
        
        <p>祝好！<br>博客系统</p>
      </div>
    `;
}
