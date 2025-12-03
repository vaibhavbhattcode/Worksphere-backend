// utils/emailService.js
import nodemailer from "nodemailer";
import messages from "./messages.js";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const emailTemplates = {
  verifyEmail: (name, verificationUrl) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Verify Your Email</title>
      <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: auto; }
        .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Job Portal</h1></div>
        <div class="content">
          <h2>Welcome, ${name}!</h2>
          <p>Verify your email by clicking the button below.</p>
          <a href="${verificationUrl}" class="button">Verify Email</a>
        </div>
      </div>
    </body>
    </html>
  `,
  accountDeactivated: (name) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Account Deactivated</title>
      <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: auto; }
        .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Job Portal</h1></div>
        <div class="content">
          <h2>Account Deactivated</h2>
          <p>Dear ${name}, your account has been deactivated.</p>
          <a href="${process.env.FRONTEND_URL}/support" class="button">Contact Support</a>
        </div>
      </div>
    </body>
    </html>
  `,
  jobMatch: ({ name = 'Candidate', jobTitle = '', companyName = '', jobUrl = '#' } = {}) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>New Job Matching Your Skills</title>
      <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: auto; }
        .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Job Portal</h1></div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>We've found a new job that matches some of your skills:</p>
          <p><strong>${jobTitle}</strong> at <strong>${companyName}</strong></p>
          <p>
            <a href="${jobUrl}" class="button">View Job</a>
          </p>
          <p>If you're interested, click the button above to view and apply.</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

export const sendEmail = async (to, subject, template, data = {}) => {
  try {
    const html = emailTemplates[template](data);
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export default { sendEmail, emailTemplates };
