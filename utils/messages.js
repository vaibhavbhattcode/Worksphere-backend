// utils/messages.js
const messages = {
  en: {
    errors: {
      // Authentication errors
      userNotFound: "User not found",
      companyNotFound: "Company not found",
      invalidCredentials: "Invalid email or password",
      incorrectPassword: "Incorrect password",
      emailNotVerified: "Please verify your email before logging in",
      accountDeactivated: "Your account is deactivated. Please contact support.",
      accountLocked: "Account locked due to multiple failed login attempts",
      unauthorized: "Unauthorized - Please login to continue",
      forbidden: "You do not have permission to perform this action",
      invalidToken: "Invalid or expired token",
      expiredToken: "Token has expired",
      tokenMissing: "Authorization token is required",
      
      // Validation errors
      validationError: "Validation error",
      invalidEmail: "Please provide a valid email address",
      invalidPhone: "Please provide a valid phone number",
      passwordTooShort: "Password must be at least 8 characters long",
      passwordMismatch: "Passwords do not match",
      
      // Resource errors
      jobNotFound: "Job not found",
      applicationNotFound: "Application not found",
      profileNotFound: "Profile not found",
      resourceExists: "Resource already exists",
      userExists: "User with this email already exists",
      companyExists: "Company with this email already exists",
      
      // General errors
      serverError: "Internal server error. Please try again later.",
      badRequest: "Bad request",
      notFound: "Resource not found",
      tooManyRequests: "Too many requests. Please try again later.",
      
      // File upload errors
      fileUploadError: "Error uploading file",
      invalidFileType: "Invalid file type",
      fileTooLarge: "File size exceeds limit",
      
      // Email errors
      emailSendError: "Failed to send email. Please try again.",
      verificationEmailError: "Failed to send verification email",
    },
    success: {
      // Authentication success
      registration: "Registration successful. Please check your email to verify your account.",
      registrationComplete: "Registration completed successfully. Please login.",
      login: "Login successful",
      logout: "Logged out successfully",
      emailVerified: "Email verified successfully. You can now login.",
      passwordReset: "Password reset successfully. Please login with your new password.",
      passwordResetEmailSent: "Password reset email sent. Please check your inbox.",
      
      // Profile success
      profileUpdated: "Profile updated successfully",
      photoUploaded: "Photo uploaded successfully",
      resumeUploaded: "Resume uploaded successfully",
      resumeDeleted: "Resume deleted successfully",
      
      // Job success
      jobCreated: "Job posted successfully",
      jobUpdated: "Job updated successfully",
      jobDeleted: "Job deleted successfully",
      jobClosed: "Job closed successfully",
      
      // Application success
      applicationSubmitted: "Application submitted successfully",
      applicationUpdated: "Application status updated",
      applicationWithdrawn: "Application withdrawn successfully",
      
      // Email success
      emailSent: "Email sent successfully",
      verificationEmailSent: "Verification email sent. Please check your inbox.",
      
      // General success
      operationSuccessful: "Operation completed successfully",
      dataRetrieved: "Data retrieved successfully",
      recordCreated: "Record created successfully",
      recordUpdated: "Record updated successfully",
      recordDeleted: "Record deleted successfully",
    },
    notifications: {
      newJob: "New job posted: {jobTitle} in {industry}",
      jobMatch: "New job matches your profile: {jobTitle}",
      applicationReceived: "New application received for {jobTitle}",
      applicationStatus: "Your application status has been updated",
      interviewScheduled: "Interview scheduled for {jobTitle}",
      interviewReminder: "Interview reminder: {jobTitle} in {time}",
      messageReceived: "New message from {sender}",
      accountDeactivated: "Account deactivated",
      accountActivated: "Account activated",
    },
  },
  // Add other languages as needed
};

export default messages;
