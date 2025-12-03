// models/Company.js
import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, select: false },
    googleId: { type: String },
    authMethod: { type: String, enum: ["local", "google"], default: "local" },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  { timestamps: true }
);

// Useful indexes
companySchema.index({ isActive: 1 }); // For active company filtering
companySchema.index({ isVerified: 1 }); // For verified company checks
companySchema.index({ createdAt: -1 }); // For sorting by registration date
companySchema.index({ googleId: 1 }); // For Google OAuth login
companySchema.index({ isActive: 1, isVerified: 1 }); // Compound index for active verified companies

// Cascade delete: Remove all related data when a company is deleted
companySchema.pre('findOneAndDelete', async function(next) {
  try {
    const companyId = this.getQuery()._id;
    
    if (!companyId) {
      console.log('⚠️ No company ID found in cascade delete');
      return next();
    }
    
    console.log(`🗑️ Starting cascade delete for Company: ${companyId}`);
    
    // Safely get models - check if they exist before using
    const getModelSafely = (modelName) => {
      try {
        return mongoose.model(modelName);
      } catch (error) {
        console.log(`⚠️ Model ${modelName} not found, skipping...`);
        return null;
      }
    };
    
    const CompanyProfile = getModelSafely('CompanyProfile');
    const Job = getModelSafely('Job');
    const Application = getModelSafely('Application');
    const Conversation = getModelSafely('Conversation');
    const Message = getModelSafely('Message');
    const Notification = getModelSafely('Notification');
    const Interview = getModelSafely('Interview');
    
    // Delete company profile
    if (CompanyProfile) {
      const profileResult = await CompanyProfile.deleteOne({ company: companyId });
      console.log(`   📄 Deleted ${profileResult.deletedCount} company profile(s)`);
    }
    
    // Find all jobs posted by this company
    if (Job && Application) {
      const jobs = await Job.find({ companyId: companyId });
      const jobIds = jobs.map(j => j._id);
      console.log(`   💼 Found ${jobs.length} job(s) to clean up`);
      
      // Delete all applications for these jobs
      if (jobIds.length > 0) {
        const appResult = await Application.deleteMany({ jobId: { $in: jobIds } });
        console.log(`   📋 Deleted ${appResult.deletedCount} application(s)`);
      }
      
      // Delete all jobs
      const jobResult = await Job.deleteMany({ companyId: companyId });
      console.log(`   💼 Deleted ${jobResult.deletedCount} job(s)`);
    }
    
    // Delete conversations and related messages
    if (Conversation && Message) {
      const conversations = await Conversation.find({ company: companyId });
      const conversationIds = conversations.map(c => c._id);
      console.log(`   💬 Found ${conversations.length} conversation(s) to clean up`);
      
      if (conversationIds.length > 0) {
        const msgResult = await Message.deleteMany({ conversation: { $in: conversationIds } });
        console.log(`   📨 Deleted ${msgResult.deletedCount} message(s)`);
      }
      
      const convResult = await Conversation.deleteMany({ company: companyId });
      console.log(`   💬 Deleted ${convResult.deletedCount} conversation(s)`);
    }
    
    // Delete notifications
    if (Notification) {
      const notifResult = await Notification.deleteMany({ companyId: companyId });
      console.log(`   🔔 Deleted ${notifResult.deletedCount} notification(s)`);
    }
    
    // Delete interviews where company is involved
    if (Interview) {
      const interviewResult = await Interview.deleteMany({ companyId: companyId });
      console.log(`   📅 Deleted ${interviewResult.deletedCount} interview(s)`);
    }
    
    console.log(`✅ Cascade delete completed for Company: ${companyId}`);
    next();
  } catch (error) {
    console.error('❌ Error in Company cascade delete:', error);
    // Don't block the delete operation - log error but continue
    next();
  }
});

// Also handle deleteOne
companySchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    const companyId = this._id;
    
    if (!companyId) {
      console.log('⚠️ No company ID found in cascade delete (deleteOne)');
      return next();
    }
    
    console.log(`🗑️ Starting cascade delete (deleteOne) for Company: ${companyId}`);
    
    const getModelSafely = (modelName) => {
      try {
        return mongoose.model(modelName);
      } catch (error) {
        console.log(`⚠️ Model ${modelName} not found, skipping...`);
        return null;
      }
    };
    
    const CompanyProfile = getModelSafely('CompanyProfile');
    const Job = getModelSafely('Job');
    const Application = getModelSafely('Application');
    const Conversation = getModelSafely('Conversation');
    const Message = getModelSafely('Message');
    const Notification = getModelSafely('Notification');
    const Interview = getModelSafely('Interview');
    
    if (CompanyProfile) {
      await CompanyProfile.deleteOne({ company: companyId });
    }
    
    if (Job && Application) {
      const jobs = await Job.find({ companyId: companyId });
      const jobIds = jobs.map(j => j._id);
      
      if (jobIds.length > 0) {
        await Application.deleteMany({ jobId: { $in: jobIds } });
      }
      await Job.deleteMany({ companyId: companyId });
    }
    
    if (Conversation && Message) {
      const conversations = await Conversation.find({ company: companyId });
      const conversationIds = conversations.map(c => c._id);
      
      if (conversationIds.length > 0) {
        await Message.deleteMany({ conversation: { $in: conversationIds } });
      }
      await Conversation.deleteMany({ company: companyId });
    }
    
    if (Notification) {
      await Notification.deleteMany({ companyId: companyId });
    }
    
    if (Interview) {
      await Interview.deleteMany({ companyId: companyId });
    }
    
    console.log(`✅ Cascade delete (deleteOne) completed for Company: ${companyId}`);
    next();
  } catch (error) {
    console.error('❌ Error in Company cascade delete (deleteOne):', error);
    // Don't block the delete operation
    next();
  }
});

export default mongoose.model("Company", companySchema);
