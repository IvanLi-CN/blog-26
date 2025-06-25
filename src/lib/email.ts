import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const transporter = nodemailer.createTransport({
  host: import.meta.env.SMTP_HOST,
  port: Number(import.meta.env.SMTP_PORT),
  secure: Number(import.meta.env.SMTP_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: import.meta.env.SMTP_USER,
    pass: import.meta.env.SMTP_PASSWORD,
  },
});

export async function sendEmail({ to, subject, text, html }: EmailOptions) {
  const mailOptions = {
    from: `"${import.meta.env.SMTP_FROM_NAME}" <${import.meta.env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    return info;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw new Error('Failed to send email');
  }
}

export function generateVerificationEmailHTML(code: string): string {
  return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #333;">您的验证码</h2>
        <p>您好！</p>
        <p>感谢您使用我们的评论功能。您的临时登录验证码是：</p>
        <p style="font-size: 24px; font-weight: bold; color: #444; letter-spacing: 2px; border: 1px solid #ddd; padding: 10px 15px; display: inline-block;">
          ${code}
        </p>
        <p>此验证码将在 10 分钟内过期。请勿与他人分享。</p>
        <p>如果您没有请求此验证码，请忽略此邮件。</p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 0.9em; color: #888;">此邮件为系统自动发送，请勿直接回复。</p>
      </div>
    `;
}

export function generateReplyNotificationEmailHTML(
  parentAuthorNickname: string,
  postSlug: string,
  replyAuthorNickname: string,
  replyContent: string
): string {
  const postUrl = `${import.meta.env.SITE_URL}/blog/${postSlug}`;
  const contentPreview = replyContent.length > 100 ? `${replyContent.substring(0, 100)}...` : replyContent;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color: #333;">您在文章上的评论有了新回复</h2>
      <p>您好, ${parentAuthorNickname}！</p>
      <p><b>${replyAuthorNickname}</b> 回复了您的评论:</p>
      <div style="border-left: 3px solid #ddd; padding-left: 15px; margin: 15px 0;">
        <p>${contentPreview}</p>
      </div>
      <p>您可以点击下方链接查看完整的对话：</p>
      <p><a href="${postUrl}" style="color: #007bff; text-decoration: none;">点击这里查看回复</a></p>
      <hr style="border: none; border-top: 1px solid #eee;" />
      <p style="font-size: 0.9em; color: #888;">此邮件为系统自动发送，请勿直接回复。</p>
    </div>
  `;
}

export function generateMentionNotificationEmailHTML(
  mentionedUserNickname: string,
  postSlug: string,
  mentionAuthorNickname: string,
  mentionContent: string
): string {
  const postUrl = `${import.meta.env.SITE_URL}/blog/${postSlug}`;
  const contentPreview = mentionContent.length > 100 ? `${mentionContent.substring(0, 100)}...` : mentionContent;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color: #333;">有人在评论中提及了您</h2>
      <p>您好, ${mentionedUserNickname}！</p>
      <p><b>${mentionAuthorNickname}</b> 在一篇文章的评论中提及了您:</p>
      <div style="border-left: 3px solid #ddd; padding-left: 15px; margin: 15px 0;">
        <p>${contentPreview}</p>
      </div>
      <p>您可以点击下方链接查看该评论：</p>
      <p><a href="${postUrl}" style="color: #007bff; text-decoration: none;">点击这里查看评论</a></p>
      <hr style="border: none; border-top: 1px solid #eee;" />
      <p style="font-size: 0.9em; color: #888;">此邮件为系统自动发送，请勿直接回复。</p>
    </div>
  `;
}
