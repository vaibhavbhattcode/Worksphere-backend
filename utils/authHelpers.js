// utils/authHelpers.js - Centralized authentication helpers
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { signUserToken, signCompanyToken } from "./jwt.js";
import sendEmail from "./sendEmail.js";
import templates from "./emailTemplates.js";

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Match result
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate verification token
 * @returns {Object} Token and expiry date
 */
export const generateVerificationToken = () => {
  const token = crypto.randomBytes(20).toString("hex");
  const expires = new Date(Date.now() + 3600000); // 1 hour
  return { token, expires };
};

/**
 * Generate password reset token
 * @returns {Object} Token and expiry date
 */
export const generateResetToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600000); // 1 hour
  return { token, expires };
};

/**
 * Send verification email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} token - Verification token
 * @param {string} type - 'user' or 'company'
 */
export const sendVerificationEmail = async (email, name, token, type = 'user') => {
  const baseUrl = process.env.BACKEND_URL;
  const route = type === 'company' ? '/api/company/auth/verify-email' : '/api/auth/verify-email';
  const verificationUrl = `${baseUrl}${route}?token=${token}&email=${encodeURIComponent(email)}`;
  
  const { subject, html } = templates.verifyEmail({ name, verifyUrl: verificationUrl });
  await sendEmail(email, subject, undefined, html);
};

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} token - Reset token
 * @param {string} type - 'user' or 'company'
 */
export const sendPasswordResetEmail = async (email, name, token, type = 'user') => {
  const frontendUrl = process.env.FRONTEND_URL;
  const route = type === 'company' ? '/company/reset-password' : '/reset-password';
  const resetUrl = `${frontendUrl}${route}?token=${token}&email=${encodeURIComponent(email)}`;
  
  const { subject, html } = templates.resetPassword({ name, resetUrl });
  await sendEmail(email, subject, undefined, html);
};

/**
 * Handle failed login attempts and account lockout
 * @param {Object} account - User or Company document
 * @returns {Object} Status and message
 */
export const handleFailedLogin = async (account) => {
  account.failedLoginAttempts = (account.failedLoginAttempts || 0) + 1;
  
  if (account.failedLoginAttempts >= 5) {
    account.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lock
    await account.save();
    return {
      locked: true,
      message: "Account locked due to multiple failed login attempts. Try again in 15 minutes.",
      statusCode: 423
    };
  }
  
  await account.save();
  const remainingAttempts = 5 - account.failedLoginAttempts;
  return {
    locked: false,
    message: `Incorrect password. ${remainingAttempts} attempt(s) remaining.`,
    statusCode: 401
  };
};

/**
 * Check if account is locked
 * @param {Object} account - User or Company document
 * @returns {Object} Lock status and message
 */
export const checkAccountLock = (account) => {
  if (account.lockUntil && account.lockUntil > Date.now()) {
    const minutes = Math.ceil((account.lockUntil - Date.now()) / 60000);
    return {
      locked: true,
      message: `Account locked due to multiple failed login attempts. Try again in ${minutes} minute(s).`,
      statusCode: 423
    };
  }
  return { locked: false };
};

/**
 * Reset failed login attempts on successful login
 * @param {Object} account - User or Company document
 */
export const resetFailedAttempts = async (account) => {
  if (account.failedLoginAttempts > 0 || account.lockUntil) {
    account.failedLoginAttempts = 0;
    account.lockUntil = undefined;
    await account.save();
  }
};

/**
 * Generate JWT token for user
 * @param {Object} user - User document
 * @returns {string} JWT token
 */
export const generateUserToken = (user) => {
  return signUserToken(user);
};

/**
 * Generate JWT token for company
 * @param {Object} company - Company document
 * @returns {string} JWT token
 */
export const generateCompanyToken = (company) => {
  return signCompanyToken(company);
};

/**
 * Extract bearer token from request headers
 * @param {Object} req - Express request object
 * @returns {string|null} Token or null
 */
export const extractBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  const parts = auth.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }
  return null;
};

export default {
  hashPassword,
  comparePassword,
  generateVerificationToken,
  generateResetToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  handleFailedLogin,
  checkAccountLock,
  resetFailedAttempts,
  generateUserToken,
  generateCompanyToken,
  extractBearerToken,
};
