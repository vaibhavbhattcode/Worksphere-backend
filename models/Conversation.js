// models/Conversation.js
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "" },
    userUnreadCount: { type: Number, default: 0 },
    companyUnreadCount: { type: Number, default: 0 },
    archivedBy: {
      user: { type: Boolean, default: false },
      company: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

conversationSchema.index({ user: 1, company: 1 }, { unique: true });
conversationSchema.index({ lastMessageAt: -1 }); // For sorting conversations by recent activity
conversationSchema.index({ user: 1, lastMessageAt: -1 }); // For user's recent conversations
conversationSchema.index({ company: 1, lastMessageAt: -1 }); // For company's recent conversations

// Cascade delete: Remove all messages when a conversation is deleted
conversationSchema.pre('findOneAndDelete', async function(next) {
  try {
    const conversationId = this.getQuery()._id;
    
    const Message = mongoose.model('Message');
    
    // Delete all messages in this conversation
    await Message.deleteMany({ conversation: conversationId });
    
    console.log(`✅ Cascade delete completed for Conversation: ${conversationId}`);
    next();
  } catch (error) {
    console.error('Error in Conversation cascade delete:', error);
    next(error);
  }
});

conversationSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    const conversationId = this._id;
    
    const Message = mongoose.model('Message');
    
    await Message.deleteMany({ conversation: conversationId });
    
    console.log(`✅ Cascade delete completed for Conversation: ${conversationId}`);
    next();
  } catch (error) {
    console.error('Error in Conversation cascade delete:', error);
    next(error);
  }
});

export default mongoose.model("Conversation", conversationSchema);


