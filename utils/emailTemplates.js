// utils/emailTemplates.js

const brand = {
  name: process.env.APP_BRAND || "WorkSphere",
  primary: "#1a73e8",
  dark: "#1f2937",
  danger: "#e53935",
  success: "#16a34a",
  lightBg: "#f5f7fa",
};

const layout = ({
  title,
  heading,
  greeting,
  body,
  cta,
  secondaryCta,
  note,
  meta,
  tone = "primary", // primary | danger | success | dark
}) => {
  const toneColor = tone === "danger" ? brand.danger : tone === "success" ? brand.success : tone === "dark" ? brand.dark : brand.primary;
  const safe = (v) => (v == null ? "" : String(v));
  const button = cta
    ? `<a href="${safe(cta.url)}" class="btn" style="background:${toneColor};">${safe(cta.label)}</a>`
    : "";
  const secondary = secondaryCta
    ? `<a href="${safe(secondaryCta.url)}" class="btn secondary">${safe(secondaryCta.label)}</a>`
    : "";
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${safe(title || heading || brand.name)}</title>
    <style>
      body{margin:0;padding:0;background:${brand.lightBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif;color:#111827;line-height:1.6}
      .wrap{padding:24px}
      .card{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08)}
      .header{background:${brand.dark};padding:24px;text-align:center;color:#fff}
      .brand{margin:0;font-size:22px;font-weight:700}
      .content{padding:32px 28px;text-align:left}
      h1{font-size:20px;margin:0 0 12px;color:${toneColor}}
      p{margin:0 0 14px;color:#374151}
      .details{margin:18px 0;padding:14px;background:#f9fafb;border:1px solid #eef2f7;border-radius:8px}
      .details .row{display:flex;justify-content:space-between;margin:6px 0;font-size:14px;color:#374151}
      .btn{display:inline-block;margin:12px 8px 0 0;padding:12px 18px;color:#fff !important;text-decoration:none;border-radius:8px;font-weight:600}
      .btn.secondary{background:#6b7280}
      .note{font-size:13px;color:#6b7280;margin-top:14px}
      .footer{padding:18px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #eef2f7}
      .muted{color:#9ca3af}
      @media (max-width:480px){.content{padding:24px 18px}}
    </style>
  </head>
  <body>
   <div class="wrap">
     <div class="card">
       <div class="header">
         <h2 class="brand">${brand.name}</h2>
       </div>
       <div class="content">
         ${heading ? `<h1>${safe(heading)}</h1>` : ""}
         ${greeting ? `<p>${safe(greeting)}</p>` : ""}
         ${body ? `<p>${safe(body)}</p>` : ""}
         ${cta ? button : ""}
         ${secondaryCta ? secondary : ""}
         ${note ? `<p class="note">${safe(note)}</p>` : ""}
         ${meta && meta.length ? `<div class="details">${meta
           .map(m => `<div class=\"row\"><span>${safe(m.label)}</span><span>${safe(m.value)}</span></div>`)
           .join("")}</div>` : ""}
       </div>
       <div class="footer">
         <div>© ${new Date().getFullYear()} ${brand.name}. All rights reserved.</div>
         <div class="muted"><a href="${process.env.FRONTEND_URL || '#'}" style="color:${brand.primary};text-decoration:none">Website</a> • <a href="${(process.env.FRONTEND_URL || '') + '/privacy'}" style="color:${brand.primary};text-decoration:none">Privacy</a></div>
       </div>
     </div>
   </div>
  </body>
  </html>`;
};

export const templates = {
  verifyEmail: ({ name, verifyUrl }) => ({
    subject: `Verify Your Email` ,
    html: layout({
      heading: `Verify your email`,
      greeting: `Welcome, ${name || 'there'}!`,
      body: `Please verify your email to activate your account and start using ${brand.name}.`,
      cta: { label: "Verify Email", url: verifyUrl },
      note: "This link will expire in 1 hour.",
      tone: "primary",
    }),
  }),
  resetPassword: ({ actor = 'Account', resetUrl }) => ({
    subject: `Reset your ${actor} password`,
    html: layout({
      heading: `Reset your password`,
      body: `We received a request to reset your password. Click the button below to set a new one.`,
      cta: { label: "Reset Password", url: resetUrl },
      note: "If you didn’t request this, you can safely ignore this email.",
      tone: "primary",
    }),
  }),
  accountStatus: ({ name, isActive, actor = 'Account' }) => ({
    subject: isActive ? `${actor} Activated` : `${actor} Deactivated`,
    html: layout({
      heading: isActive ? `${actor} activated` : `${actor} deactivated`,
      greeting: `Dear ${name || 'User'},`,
      body: isActive
        ? `Your ${actor.toLowerCase()} has been activated. You can now sign in and continue using ${brand.name}.`
        : `Your ${actor.toLowerCase()} has been deactivated by the admin. If this is unexpected, please contact support.`,
      cta: isActive ? { label: "Go to Dashboard", url: process.env.FRONTEND_URL || '#' } : { label: "Contact Support", url: (process.env.FRONTEND_URL || '') + '/support' },
      tone: isActive ? "success" : "danger",
    }),
  }),
  accountDeleted: ({ name, actor = 'Account' }) => ({
    subject: `${actor} Deleted`,
    html: layout({
      heading: `${actor} deleted`,
      greeting: `Dear ${name || 'User'},`,
      body: `Your ${actor.toLowerCase()} has been deleted by the admin. If you have any questions, please contact support.`,
      cta: { label: "Contact Support", url: (process.env.FRONTEND_URL || '') + '/support' },
      tone: "dark",
    }),
  }),
  jobStatus: ({ companyName, jobTitle, status }) => ({
    subject: `Job ${status}: ${jobTitle}`,
    html: layout({
      heading: `Job ${status}`,
      greeting: `Dear ${companyName || 'Company'},`,
      body: `Your job posting "${jobTitle}" has been ${status.toLowerCase()} by the admin.`,
      cta: { label: "View Jobs", url: (process.env.FRONTEND_URL || '') + '/company/jobs' },
      tone: status === 'Approved' ? 'success' : status === 'Rejected' ? 'danger' : 'dark',
    }),
  }),
  applicationSubmitted: ({ name, companyName, jobTitle, applicationId, jobId }) => ({
    subject: `Application Submitted: ${jobTitle}`,
    html: layout({
      heading: 'Application submitted successfully',
      greeting: `Dear ${name || 'Candidate'},`,
      body: `Your application for the position of "${jobTitle}" at ${companyName} has been successfully submitted. The hiring team will review your application and get back to you soon.`,
      cta: { label: 'View Job Details', url: (process.env.FRONTEND_URL || 'http://localhost:3000') + `/job/${jobId}` },
      note: 'We wish you the best of luck with your application!',
      tone: 'success',
    }),
  }),
  applicationStatus: ({ name, companyName, jobTitle, status }) => ({
    subject: `Application ${status}: ${jobTitle}`,
    html: layout({
      heading: `Application ${status}`,
      greeting: `Dear ${name || 'Applicant'},`,
      body: status === 'hired'
        ? `Great news! You have been hired for the position of "${jobTitle}" at ${companyName}.`
        : `Thank you for applying. Your application for "${jobTitle}" at ${companyName} was not successful this time.`,
      cta: status === 'hired' ? { label: 'View Offer / Next Steps', url: (process.env.FRONTEND_URL || '') + '/applications' } : { label: 'View Recommended Jobs', url: (process.env.FRONTEND_URL || '') + '/jobs' },
      tone: status === 'hired' ? 'success' : 'dark',
    }),
  }),
  interviewScheduled: ({ name, companyName, jobTitle, dateStr, timeStr, joinUrl, notes, isReschedule }) => ({
    subject: `${isReschedule ? 'Interview Rescheduled' : 'Interview Scheduled'} - ${jobTitle}`,
    html: layout({
      heading: isReschedule ? 'Interview rescheduled' : 'Interview scheduled',
      greeting: `Dear ${name || 'Candidate'},`,
      body: `${isReschedule ? 'Your interview has been rescheduled' : 'Your interview has been scheduled'} for the position of "${jobTitle}" at ${companyName}. Use the button below to join at the scheduled time.`,
      cta: { label: 'Join Interview', url: joinUrl },
      note: notes || '',
      meta: [
        { label: 'Date', value: dateStr },
        { label: 'Time', value: timeStr },
        { label: 'Location', value: 'Virtual (Jitsi Meet)' },
      ],
      tone: isReschedule ? 'primary' : 'success',
    }),
  }),
  interviewCancelled: ({ name, companyName, jobTitle }) => ({
    subject: `Interview Cancelled - ${jobTitle}`,
    html: layout({
      heading: 'Interview cancelled',
      greeting: `Dear ${name || 'Candidate'},`,
      body: `We regret to inform you that your interview for "${jobTitle}" at ${companyName} has been cancelled.`,
      cta: { label: 'View Applications', url: (process.env.FRONTEND_URL || '') + '/applications' },
      tone: 'danger',
    }),
  }),
};

export default templates;
