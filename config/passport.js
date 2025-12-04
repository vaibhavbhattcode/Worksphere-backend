// config/passport.js
import dotenv from "dotenv";
dotenv.config();
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import UserProfile from "../models/UserProfile.js";
import Company from "../models/Company.js";

// Local strategy for job seekers (user login)
passport.use(
  "local-user",
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
        if (!user) return done(null, false, { message: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: "Incorrect password" });
        return done(null, { id: user.id, type: "user", email: user.email });
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Helper: only register Google strategies if env credentials are present
const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);

if (hasGoogleCreds) {
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || `${process.env.BACKEND_URL || "http://localhost:5000"}/api/auth/google/callback`;
  console.log("[passport] Google OAuth callback URL:", callbackURL);
  
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          if (!profile.emails?.length) {
            return done(new Error("No email found in Google profile"), null);
          }
          const emailLower = profile.emails[0].value.toLowerCase();
          let user = await User.findOne({ email: emailLower });
          if (!user) {
            user = new User({
              email: emailLower,
              googleId: profile.id,
              authMethod: "google",
              isVerified: true,
            });
            await user.save();
            const userProfile = new UserProfile({ user: user._id, name: profile.displayName });
            await userProfile.save();
          }
          if (user.isActive === false) {
            return done(new Error("User account is deactivated. Please contact support."), null);
          }
          return done(null, { id: user.id, type: "user", email: emailLower });
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
} else {
  console.warn("[passport] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing – skipping user Google OAuth strategy");
}

// We are JWT-only (no persistent sessions), but serialize/deserialize are harmless fallbacks
passport.serializeUser((userData, done) => {
  done(null, userData);
});

passport.deserializeUser(async (sessionData, done) => {
  try {
    if (!sessionData?.id || !sessionData?.type) return done(null, null);
    if (sessionData.type === "company") {
      const company = await Company.findById(sessionData.id);
      return done(null, company);
    }
    if (sessionData.type === "user") {
      const user = await User.findById(sessionData.id);
      return done(null, user);
    }
    return done(null, null);
  } catch (error) {
    done(error, null);
  }
});
