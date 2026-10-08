const nodemailer = require("nodemailer");

function mailUser() {
  return String(process.env.EMAIL || process.env.SMTP_USER || "").trim();
}

function mailPass() {
  return String(process.env.APP_PASSWORD || process.env.SMTP_PASS || "")
    .replace(/\s+/g, "")
    .trim();
}

function smtpConfigured() {
  return Boolean(mailUser() && mailPass());
}

function getTransporter() {
  if (!smtpConfigured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: mailUser(),
      pass: mailPass(),
    },
  });
}

function fromAddress() {
  const user = mailUser();
  return process.env.MAIL_FROM || user || "noreply@localhost";
}

async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.warn("sendMail skipped: missing recipient");
    return { skipped: true };
  }
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      "Email not sent (set EMAIL and APP_PASSWORD in .env):",
      subject,
      "->",
      to
    );
    return { skipped: true };
  }
  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, " "),
  });
  return { skipped: false };
}

function wrapHtml(title, body) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#6b21a8">${title}</h2>
      ${body}
      <p style="color:#666;font-size:13px;margin-top:28px">ChatPro</p>
    </div>
  `;
}

async function notifyAdminNewHostRequest(request) {
  const adminTo = process.env.ADMIN_NOTIFY_EMAIL || mailUser();
  return sendMail({
    to: adminTo,
    subject: "New request received to become a host",
    html: wrapHtml(
      "New host request",
      `<p>A user submitted a request to become a host. Please verify the payment.</p>
       <ul>
         <li><strong>Name:</strong> ${request.name || "-"}</li>
         <li><strong>Email:</strong> ${request.email || "-"}</li>
         <li><strong>Amount:</strong> ₹${request.amount ?? "-"}</li>
         <li><strong>Transaction ID:</strong> ${request.transactionId || "-"}</li>
         <li><strong>UPI ID:</strong> ${request.upiId || "-"}</li>
       </ul>
       <p>Open the admin Host Requests page to confirm or reject.</p>`
    ),
  });
}

async function notifyUserHostRequestReceived(email, name) {
  return sendMail({
    to: email,
    subject: "We received your host request",
    html: wrapHtml(
      "Request received",
      `<p>Hi ${name || "there"},</p>
       <p>Your request to become a host has been sent to admin. Admin will contact you as soon as possible.</p>
       <p><strong>Confirmation time is maximum 20 minutes.</strong></p>`
    ),
  });
}

async function notifyUserHostApproved(email, name) {
  return sendMail({
    to: email,
    subject: "Congratulations — you are a host now",
    html: wrapHtml(
      "You are a host now",
      `<p>Hi ${name || "there"},</p>
       <p>Your payment was verified. Congratulations — you are a host now and can access host privileges (groups, live, and more).</p>
       <p>You can switch between user and host profile anytime from Chat.</p>`
    ),
  });
}

async function notifyAdminNewPlanRequest(request) {
  const adminTo = process.env.ADMIN_NOTIFY_EMAIL || mailUser();
  return sendMail({
    to: adminTo,
    subject: `New plan activation request (${request.planName || "PLAN"})`,
    html: wrapHtml(
      "New plan request",
      `<p>A user submitted payment details to activate a plan. Please verify and approve.</p>
       <ul>
         <li><strong>Plan:</strong> ${request.planName || "-"}</li>
         <li><strong>Name:</strong> ${request.name || "-"}</li>
         <li><strong>Email:</strong> ${request.email || "-"}</li>
         <li><strong>Amount:</strong> ₹${request.amount ?? "-"}</li>
         <li><strong>Transaction ID:</strong> ${request.transactionId || "-"}</li>
         <li><strong>UPI ID:</strong> ${request.upiId || "-"}</li>
       </ul>
       <p>Open the admin Plan Requests page to confirm or reject.</p>`
    ),
  });
}

async function notifyUserPlanRequestReceived(email, name, planName) {
  return sendMail({
    to: email,
    subject: "We received your plan activation request",
    html: wrapHtml(
      "Request received",
      `<p>Hi ${name || "there"},</p>
       <p>Your request to activate the <strong>${planName || "plan"}</strong> has been sent to admin.</p>
       <p>Admin will contact you as soon as possible. <strong>Confirmation time is maximum 20 minutes.</strong></p>`
    ),
  });
}

async function notifyUserPlanApproved(email, name, planName) {
  return sendMail({
    to: email,
    subject: "Your plan is now active",
    html: wrapHtml(
      "Plan activated",
      `<p>Hi ${name || "there"},</p>
       <p>Your payment was verified. Your <strong>${planName || "plan"}</strong> is now active.</p>
       <p>Host privilege is included. You can switch to host profile from Chat.</p>`
    ),
  });
}

async function notifyUserPlanRejected(email, name, adminNote) {
  return sendMail({
    to: email,
    subject: "Plan request update",
    html: wrapHtml(
      "Plan request not approved",
      `<p>Hi ${name || "there"},</p>
       <p>Your plan activation request was not approved after payment review.</p>
       ${adminNote ? `<p><strong>Note:</strong> ${adminNote}</p>` : ""}
       <p>You can submit a new request from the Plans page if needed.</p>`
    ),
  });
}

async function notifyUserHostRejected(email, name, adminNote) {
  return sendMail({
    to: email,
    subject: "Host request update",
    html: wrapHtml(
      "Host request not approved",
      `<p>Hi ${name || "there"},</p>
       <p>Your request to become a host was not approved after payment review.</p>
       ${adminNote ? `<p><strong>Note:</strong> ${adminNote}</p>` : ""}
       <p>You can submit a new request from Chat if needed.</p>`
    ),
  });
}

module.exports = {
  sendMail,
  smtpConfigured,
  notifyAdminNewHostRequest,
  notifyUserHostRequestReceived,
  notifyUserHostApproved,
  notifyUserHostRejected,
  notifyAdminNewPlanRequest,
  notifyUserPlanRequestReceived,
  notifyUserPlanApproved,
  notifyUserPlanRejected,
};
