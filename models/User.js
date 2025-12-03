// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, select: false },
    googleId: { type: String },
    role: {
      type: String,
      enum: ["jobSeeker", "employer", "admin"],
      default: "jobSeeker",
    },
    isVerified: { type: Boolean, default: false },
    authMethod: { type: String, enum: ["local", "google"], default: "local" },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    mobileVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Useful indexes
userSchema.index({ role: 1 }); // For role-based queries
userSchema.index({ isAdmin: 1 }); // For admin checks
userSchema.index({ isActive: 1 }); // For active user filtering
userSchema.index({ isVerified: 1 }); // For verified user checks
userSchema.index({ googleId: 1 }); // For Google OAuth login
userSchema.index({ createdAt: -1 }); // For sorting by registration date
userSchema.index({ role: 1, isActive: 1 }); // Compound index for active users by role

// Cascade delete: Remove all related data when a user is deleted
userSchema.pre('findOneAndDelete', async function(next) {
  try {
    const userId = this.getQuery()._id;
    
    // Import models (using dynamic import to avoid circular dependencies)
    const UserProfile = mongoose.model('UserProfile');
    const Application = mongoose.model('Application');
    const SavedJob = mongoose.model('SavedJob');
    const Conversation = mongoose.model('Conversation');
    const Message = mongoose.model('Message');
    const Education = mongoose.model('Education');
    const Experience = mongoose.model('Experience');
    const Certificate = mongoose.model('Certificate');
    const Notification = mongoose.model('Notification');
    const Interview = mongoose.model('Interview');
    
    // Delete user profile
    await UserProfile.deleteOne({ user: userId });
    
    // Delete all applications by this user
    await Application.deleteMany({ userId: userId });
    
    // Delete saved jobs
    await SavedJob.deleteMany({ userId: userId });
    
    // Delete conversations and related messages
    const conversations = await Conversation.find({ user: userId });
    const conversationIds = conversations.map(c => c._id);
    await Message.deleteMany({ conversation: { $in: conversationIds } });
    await Conversation.deleteMany({ user: userId });
    
    // Delete education, experience, and certificates
    await Education.deleteMany({ user: userId });
    await Experience.deleteMany({ user: userId });
    await Certificate.deleteMany({ user: userId });
    
    // Delete notifications
    await Notification.deleteMany({ userId: userId });
    
    // Delete interviews where user is involved
    await Interview.deleteMany({ userId: userId });
    
    console.log(`✅ Cascade delete completed for User: ${userId}`);
    next();
  } catch (error) {
    console.error('Error in User cascade delete:', error);
    next(error);
  }
});

// Also handle deleteOne and deleteMany
userSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    const userId = this._id;
    
    const UserProfile = mongoose.model('UserProfile');
    const Application = mongoose.model('Application');
    const SavedJob = mongoose.model('SavedJob');
    const Conversation = mongoose.model('Conversation');
    const Message = mongoose.model('Message');
    const Education = mongoose.model('Education');
    const Experience = mongoose.model('Experience');
    const Certificate = mongoose.model('Certificate');
    const Notification = mongoose.model('Notification');
    const Interview = mongoose.model('Interview');
    
    await UserProfile.deleteOne({ user: userId });
    await Application.deleteMany({ userId: userId });
    await SavedJob.deleteMany({ userId: userId });
    
    const conversations = await Conversation.find({ user: userId });
    const conversationIds = conversations.map(c => c._id);
    await Message.deleteMany({ conversation: { $in: conversationIds } });
    await Conversation.deleteMany({ user: userId });
    
    await Education.deleteMany({ user: userId });
    await Experience.deleteMany({ user: userId });
    await Certificate.deleteMany({ user: userId });
    await Notification.deleteMany({ userId: userId });
    await Interview.deleteMany({ userId: userId });
    
    console.log(`✅ Cascade delete completed for User: ${userId}`);
    next();
  } catch (error) {
    console.error('Error in User cascade delete:', error);
    next(error);
  }
});

export default mongoose.model("User", userSchema);
