import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587,
  secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === "true" : false, // false for port 587
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS, // Your Gmail app password
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Verify transporter at startup (non-blocking) so we log configuration/connectivity issues early
transporter.verify().then(() => {
  console.log('[email] SMTP transporter verified successfully');
}).catch((err) => {
  console.warn('[email] SMTP transporter verification failed:', err && err.message ? err.message : err);
});

const sendEmail = async (to, subject, text, html) => {
  const maxAttempts = 3;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER || process.env.EMAIL_FROM,
        to,
        subject,
        text,
        html,
      });
      console.log(`[email] Sent to ${to} (attempt ${attempt})`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[email] send attempt ${attempt} failed for ${to}:`, error && error.message ? error.message : error);
      // Exponential backoff before retrying
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  console.error('[email] All send attempts failed for', to, '-', lastError);
  // Surface the last error to caller — caller should handle and decide whether to fail the request
  throw lastError;
};

export default sendEmail;
