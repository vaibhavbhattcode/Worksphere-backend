import User from "../models/User.js";
import UserProfile from "../models/UserProfile.js";
import { 
  hashPassword, 
  comparePassword, 
  generateVerificationToken, 
  sendVerificationEmail,
  checkAccountLock,
  handleFailedLogin,
  resetFailedAttempts,
  generateUserToken
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
  userRegisterSchema, 
  userLoginSchema 
} from "../utils/validators.js";
import messages from "../utils/messages.js";

/**
 * Register a new user
 */
export const registerUser = [
  validate(userRegisterSchema),
  async (req, res) => {
    try {
      const { name, email, password } = req.validatedBody;
      const emailLower = email.toLowerCase();

      // Check if user already exists
      const existingUser = await User.findOne({ email: emailLower });
      if (existingUser) {
        return badRequest(res, messages.en.errors.userExists);
      }

      // Hash password and generate verification token
      const hashedPassword = await hashPassword(password);
      const { token: verificationToken, expires: verificationTokenExpires } = generateVerificationToken();

      // Create user
      const user = new User({
        email: emailLower,
        password: hashedPassword,
        role: "jobSeeker",
        isVerified: false,
        verificationToken,
        verificationTokenExpires,
      });
      await user.save();

      // Create user profile
      const userProfile = new UserProfile({
        user: user._id,
        name,
      });
      await userProfile.save();

      // Send verification email
      try {
        await sendVerificationEmail(emailLower, name, verificationToken, 'user');
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        // Don't block registration if email fails
      }

      return created(res, null, messages.en.success.registration);
    } catch (error) {
      console.error("Registration Error:", error);
      return serverError(res, messages.en.errors.serverError);
    }
  }
];

/**
 * Verify user email
 */
export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return badRequest(res, messages.en.errors.invalidToken);
    }
    
    const emailLower = email.toLowerCase();

    const user = await User.findOne({
      email: emailLower,
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_token`);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.redirect(`${process.env.FRONTEND_URL}/login?verified=true`);
  } catch (error) {
    console.error("Email Verification Error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=verification_failed`);
  }
};

/**
 * Login user
 */
export const loginUser = [
  validate(userLoginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.validatedBody;
      const emailLower = email.toLowerCase();

      // Find user with password
      const user = await User.findOne({ email: emailLower }).select("+password");
      
      if (!user) {
        return notFound(res, messages.en.errors.userNotFound);
      }

      // Check if user uses Google login
      if (!user.password) {
        return badRequest(res, "Please use Google login for this account");
      }

      // Check account lock status
      const lockCheck = checkAccountLock(user);
      if (lockCheck.locked) {
        return res.status(lockCheck.statusCode).json({ 
          success: false, 
          message: lockCheck.message 
        });
      }

      // Verify password
      const isMatch = await comparePassword(password, user.password);
      if (!isMatch) {
        const failResult = await handleFailedLogin(user);
        return res.status(failResult.statusCode).json({ 
          success: false, 
          message: failResult.message 
        });
      }

      // Check if email is verified
      if (!user.isVerified) {
        return unauthorized(res, messages.en.errors.emailNotVerified);
      }

      // Check if account is active
      if (user.isActive === false) {
        return unauthorized(res, messages.en.errors.accountDeactivated);
      }

      // Reset failed attempts on successful login
      await resetFailedAttempts(user);

      // Generate JWT token
      const token = generateUserToken(user);

      // Fetch user profile
      const userProfile = await UserProfile.findOne({ user: user._id });
      const userObj = user.toObject();
      delete userObj.password;
      
      if (userProfile) {
        userObj.name = userProfile.name;
        userObj.profileImage = userProfile.profileImage;
      }

      return success(res, { token, user: userObj }, messages.en.success.login);
    } catch (error) {
      console.error("Login Error:", error);
      return serverError(res, messages.en.errors.serverError);
    }
  }
];
