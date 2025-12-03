// controllers/companyAuthController.js

import Company from "../models/Company.js";
import CompanyProfile from "../models/CompanyProfile.js";
import { 
  hashPassword, 
  comparePassword, 
  generateVerificationToken,
  generateResetToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  checkAccountLock,
  handleFailedLogin,
  resetFailedAttempts,
  generateCompanyToken
} from "../utils/authHelpers.js";
import { 
  success, 
  created, 
  badRequest, 
  unauthorized, 
  notFound, 
  serverError 
} from "../utils/apiResponse.js";
import { 
  validate, 
  companyRegisterSchema 
} from "../utils/validators.js";
import messages from "../utils/messages.js";

/**
 * Register a new company
 */
export const registerCompany = [
  validate(companyRegisterSchema),
  async (req, res) => {
    try {
      const {
        companyName,
        email,
        password,
        phone,
        companyAddress,
        industry,
        website,
      } = req.validatedBody;
      const emailLower = email.toLowerCase();

      // Check if company already exists
      const existingCompany = await Company.findOne({ email: emailLower });
      if (existingCompany) {
        return badRequest(res, messages.en.errors.companyExists);
      }

      // Hash password and generate verification token
      const hashedPassword = await hashPassword(password);
      const { token: verificationToken, expires: verificationTokenExpires } = generateVerificationToken();

      // Create company
      const company = new Company({
        email: emailLower,
        password: hashedPassword,
        authMethod: "local",
        isVerified: process.env.NODE_ENV === 'development' ? true : false, // Auto-verify in development
        verificationToken,
        verificationTokenExpires,
      });
      await company.save();

      console.log("✅ Company created:", { 
        email: emailLower, 
        isVerified: company.isVerified,
        environment: process.env.NODE_ENV 
      });

      // Create company profile
      const companyProfile = new CompanyProfile({
        company: company._id,
        companyName,
        phone,
        companyAddress,
        website,
        industry,
      });
      await companyProfile.save();

      // Send verification email
      try {
        await sendVerificationEmail(emailLower, companyName, verificationToken, 'company');
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        // Don't block registration if email fails
      }

      return created(res, null, messages.en.success.registration);
    } catch (error) {
      console.error("Company Registration Error:", error);
      return serverError(res, messages.en.errors.serverError);
    }
  }
];

/**
 * Verify company email
 */
export const verifyCompanyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.redirect(`${process.env.FRONTEND_URL}/company/login?error=invalid_token`);
    }
    
    const emailLower = email.toLowerCase();

    const company = await Company.findOne({
      email: emailLower,
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!company) {
      return res.redirect(`${process.env.FRONTEND_URL}/company/login?error=invalid_token`);
    }

    company.isVerified = true;
    company.verificationToken = undefined;
    company.verificationTokenExpires = undefined;
    await company.save();

    return res.redirect(`${process.env.FRONTEND_URL}/company/login?verified=true`);
  } catch (error) {
    console.error("Company Email Verification Error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/company/login?error=verification_failed`);
  }
};

/**
 * Login company
 */
export const loginCompany = async (req, res) => {
  try {
    console.log("🔐 Company Login Attempt:", { email: req.body.email });
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.log("❌ Missing credentials");
      return badRequest(res, "Email and password are required");
    }
    
    const emailLower = email.toLowerCase();
    console.log("🔍 Looking for company:", emailLower);

    // Find company with password
    const company = await Company.findOne({ email: emailLower }).select("+password");
    
    if (!company) {
      console.log("❌ Company not found:", emailLower);
      return notFound(res, messages.en.errors.companyNotFound);
    }

    console.log("✅ Company found:", { 
      id: company._id, 
      email: company.email,
      isVerified: company.isVerified,
      isActive: company.isActive,
      hasPassword: !!company.password 
    });

    // Check if company uses Google login
    if (!company.password) {
      console.log("❌ No password set (OAuth account)");
      return badRequest(res, "Please use Google login for this account");
    }

    // Check account lock status
    const lockCheck = checkAccountLock(company);
    if (lockCheck.locked) {
      console.log("🔒 Account locked");
      return res.status(lockCheck.statusCode).json({ 
        success: false, 
        message: lockCheck.message 
      });
    }

    // Verify password
    const isMatch = await comparePassword(password, company.password);
    if (!isMatch) {
      console.log("❌ Password mismatch");
      const failResult = await handleFailedLogin(company);
      return res.status(failResult.statusCode).json({ 
        success: false, 
        message: failResult.message 
      });
    }

    console.log("✅ Password verified");

    // Check if email is verified
    if (!company.isVerified) {
      console.log("⚠️ Email not verified");
      return unauthorized(res, messages.en.errors.emailNotVerified);
    }

    // Check if account is active
    if (company.isActive === false) {
      console.log("❌ Account deactivated");
      return unauthorized(res, messages.en.errors.accountDeactivated);
    }

    // Reset failed attempts on successful login
    await resetFailedAttempts(company);

    // Generate JWT token
    const token = generateCompanyToken(company);
    console.log("🎫 Token generated");

    // Fetch company profile
    const companyProfile = await CompanyProfile.findOne({ company: company._id });
    const companyObj = company.toObject();
    delete companyObj.password;
    
    if (companyProfile) {
      companyObj.companyName = companyProfile.companyName;
      companyObj.phone = companyProfile.phone;
      companyObj.companyAddress = companyProfile.companyAddress;
      companyObj.website = companyProfile.website;
      companyObj.industry = companyProfile.industry;
    }

    console.log("✅ Company login successful:", company.email);
    return success(res, { token, company: companyObj }, messages.en.success.login);
  } catch (error) {
    console.error("❌ Company Login Error:", error);
    return serverError(res, messages.en.errors.serverError);
  }
};

/**
 * Resend company verification email
 */
export const resendCompanyVerification = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return badRequest(res, "Email is required");
    }
    
    const emailLower = email.toLowerCase();

    const company = await Company.findOne({ email: emailLower });
    
    if (!company) {
      return notFound(res, messages.en.errors.companyNotFound);
    }
    
    if (company.isVerified) {
      return badRequest(res, "Company already verified");
    }

    // Generate new verification token
    const { token: verificationToken, expires: verificationTokenExpires } = generateVerificationToken();
    company.verificationToken = verificationToken;
    company.verificationTokenExpires = verificationTokenExpires;
    await company.save();

    // Get company profile for name
    const companyProfile = await CompanyProfile.findOne({ company: company._id });
    const companyName = companyProfile ? companyProfile.companyName : "Company";

    // Send verification email
    await sendVerificationEmail(emailLower, companyName, verificationToken, 'company');

    return success(res, null, messages.en.success.verificationEmailSent);
  } catch (error) {
    console.error("Resend Company Verification Error:", error);
    return serverError(res, messages.en.errors.serverError);
  }
};

/**
 * Forgot company password
 */
export const forgotCompanyPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return badRequest(res, "Email is required");
    }
    
    const emailLower = email.toLowerCase();

    const company = await Company.findOne({ email: emailLower });
    
    // Always return same message for security (don't reveal if email exists)
    if (!company) {
      return success(res, null, messages.en.success.passwordResetEmailSent);
    }

    // Generate reset token
    const { token: resetToken, expires: resetTokenExpires } = generateResetToken();
    company.resetPasswordToken = resetToken;
    company.resetPasswordExpires = resetTokenExpires;
    await company.save();

    // Get company profile for name
    const companyProfile = await CompanyProfile.findOne({ company: company._id });
    const companyName = companyProfile ? companyProfile.companyName : "Company";

    // Send reset email
    await sendPasswordResetEmail(emailLower, companyName, resetToken, 'company');

    return success(res, null, messages.en.success.passwordResetEmailSent);
  } catch (error) {
    console.error("Company Forgot Password Error:", error);
    return serverError(res, messages.en.errors.serverError);
  }
};

/**
 * Reset company password
 */
export const resetCompanyPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body;
    
    if (!token || !email || !password) {
      return badRequest(res, "Invalid request - missing required fields");
    }
    
    const emailLower = email.toLowerCase();

    const company = await Company.findOne({
      email: emailLower,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!company) {
      return badRequest(res, messages.en.errors.expiredToken);
    }

    // Hash new password
    company.password = await hashPassword(password);
    company.resetPasswordToken = undefined;
    company.resetPasswordExpires = undefined;
    await company.save();

    return success(res, null, messages.en.success.passwordReset);
  } catch (error) {
    console.error("Company Reset Password Error:", error);
    return serverError(res, messages.en.errors.serverError);
  }
};
