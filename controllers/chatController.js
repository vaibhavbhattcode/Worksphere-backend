// controllers/chatController.js
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import UserProfile from "../models/UserProfile.js";
import CompanyProfile from "../models/CompanyProfile.js";
import mongoose from "mongoose";
import { emitChatEvent, isActorOnline } from "../socket.js";
import { createNotification } from "./notificationController.js";

const asObjectId = (id) => new mongoose.Types.ObjectId(id);

export async function listConversations(req, res) {
  try {
    const { type, id } = req.actor;
    const query = type === "user" ? { user: id } : { company: id };
    const items = await Conversation.find(query)
      .sort({ lastMessageAt: -1 })
      .populate("user", "email")
      .populate("company", "email")
      .lean();

    // Enrich with counterparty names and avatars
    const userIds = items.map((c) => c.user).filter(Boolean);
    const companyIds = items.map((c) => c.company).filter(Boolean);
    const [userProfiles, companyProfiles] = await Promise.all([
      UserProfile.find({ user: { $in: userIds } }).select("user name profileImage").lean(),
      CompanyProfile.find({ company: { $in: companyIds } }).select("company companyName logo").lean(),
    ]);
    const userIdToProfile = new Map(userProfiles.map((p) => [String(p.user), p]));
    const companyIdToProfile = new Map(companyProfiles.map((p) => [String(p.company), p]));

    const enriched = items.map((c) => {
      const userProf = userIdToProfile.get(String(c.user?._id || c.user));
      const compProf = companyIdToProfile.get(String(c.company?._id || c.company));
      
      // Check online status of the counterparty
      const counterpartyType = type === "user" ? "company" : "user";
      const counterpartyId = type === "user" ? String(c.company?._id || c.company) : String(c.user?._id || c.user);
      const isOnline = isActorOnline(counterpartyType, counterpartyId);
      
      return {
        ...c,
        userProfile: userProf ? { name: userProf.name, profileImage: userProf.profileImage } : null,
        companyProfile: compProf ? { name: compProf.companyName, logo: compProf.logo } : null,
        isOnline: isOnline,
      };
    });
    return res.json({ conversations: enriched });
  } catch (err) {
    return res.status(500).json({ message: "Failed to list conversations" });
  }
}

export async function startConversation(req, res) {
  try {
    const { type, id } = req.actor;
    const { userId, companyId } = req.body || {};

    let user, company;
    if (type === "user") {
      user = id;
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      // Validate companyId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return res.status(400).json({ message: "Invalid companyId format" });
      }
      company = asObjectId(companyId);
    } else {
      company = id;
      if (!userId) return res.status(400).json({ message: "userId required" });
      // Validate userId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error("Invalid userId format:", userId);
        return res.status(400).json({ message: "Invalid userId format" });
      }
      user = asObjectId(userId);
    }

    const now = new Date();
    const convo = await Conversation.findOneAndUpdate(
      { user, company },
      { $setOnInsert: { user, company }, $set: { lastMessageAt: now } },
      { upsert: true, new: true }
    ).lean();

    // Enrich conversation with profile data
    const [userProfile, companyProfile] = await Promise.all([
      UserProfile.findOne({ user: convo.user }).select("user name profileImage").lean(),
      CompanyProfile.findOne({ company: convo.company }).select("company companyName logo").lean(),
    ]);

    const counterpartyType = type === "user" ? "company" : "user";
    const counterpartyId = type === "user" ? String(convo.company) : String(convo.user);
    const isOnline = isActorOnline(counterpartyType, counterpartyId);

    const enrichedConvo = {
      ...convo,
      userProfile: userProfile ? { name: userProfile.name, profileImage: userProfile.profileImage } : null,
      companyProfile: companyProfile ? { name: companyProfile.companyName, logo: companyProfile.logo } : null,
      isOnline: isOnline,
    };

    return res.status(201).json({ conversation: enrichedConvo });
  } catch (err) {
    console.error("Failed to start conversation:", err);
    return res.status(500).json({ message: "Failed to start conversation", error: err.message });
  }
}

export async function listMessages(req, res) {
  try {
    const { conversationId } = req.params;
    const { cursor, limit = 30 } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 30, 100);

    const convo = await Conversation.findById(conversationId).lean();
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    // Authorization: actor must be member
    const isUser = req.actor.type === "user" && String(convo.user) === String(req.actor.id);
    const isCompany = req.actor.type === "company" && String(convo.company) === String(req.actor.id);
    if (!isUser && !isCompany) {
      return res.status(403).json({ message: "Forbidden: You are not a participant in this conversation." });
    }

    const query = { conversation: conversationId };
    if (cursor) {
      query._id = { $lt: asObjectId(cursor) };
    }
    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(lim)
      .lean();
    return res.json({ messages: messages.reverse(), nextCursor: messages.length ? messages[0]._id : null });
  } catch (err) {
    return res.status(500).json({ message: "Failed to list messages" });
  }
}

export async function sendMessage(req, res) {
  try {
    const { conversationId } = req.params;
    const { text } = req.body || {};
    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    // Authorization: actor must be member
    const isUser = req.actor.type === "user" && String(convo.user) === String(req.actor.id);
    const isCompany = req.actor.type === "company" && String(convo.company) === String(req.actor.id);
    if (!isUser && !isCompany) {
      return res.status(403).json({ message: "Forbidden: You are not a participant in this conversation." });
    }

    const payload = {
      conversation: convo._id,
      senderType: req.actor.type,
      senderUser: req.actor.type === "user" ? req.actor.id : undefined,
      senderCompany: req.actor.type === "company" ? req.actor.id : undefined,
      deliveredAt: new Date()
    };

    if (req.file) {
      const isImage = (req.file.mimetype || "").startsWith("image/");
      payload.attachments = [{
        url: `/uploads/chat/${req.file.filename}`,
        type: isImage ? "image" : "file",
        name: req.file.originalname,
        size: req.file.size,
      }];
      payload.text = text && typeof text === "string" ? text.slice(0, 4000) : "";
    } else {
      if (!text || typeof text !== "string" || text.length > 4000) {
        return res.status(400).json({ message: "Invalid text" });
      }
      payload.text = text.trim();
    }

    const messageDoc = new Message(payload);
    await messageDoc.save();

    // Update conversation metadata and unread counters
    const isSenderUser = req.actor.type === "user";
    convo.lastMessageAt = messageDoc.createdAt;
    convo.lastMessagePreview = messageDoc.text.slice(0, 200);
    if (isSenderUser) {
      convo.companyUnreadCount = (convo.companyUnreadCount || 0) + 1;
    } else {
      convo.userUnreadCount = (convo.userUnreadCount || 0) + 1;
    }
    await convo.save();

    // Emit via sockets to both parties
    console.log('===========================================');
    console.log('sendMessage: About to emit message:new event');
    console.log('sendMessage: Sender type:', req.actor.type);
    console.log('sendMessage: Sender ID:', req.actor.id);
    console.log('sendMessage: Conversation User ID:', convo.user.toString());
    console.log('sendMessage: Conversation Company ID:', convo.company.toString());
    console.log('sendMessage: Conversation ID:', convo._id.toString());
    console.log('sendMessage: Message sender type:', messageDoc.senderType);
    console.log('===========================================');
    
    emitChatEvent("message:new", convo.user.toString(), convo.company.toString(), {
      conversationId: convo._id.toString(),
      message: { ...messageDoc.toObject(), _id: messageDoc._id.toString() }
    });

    // 🔔 Send notification to recipient if they're not online
    const recipientId = isSenderUser ? convo.company.toString() : convo.user.toString();
    const recipientType = isSenderUser ? "company" : "user";
    const isRecipientOnline = await isActorOnline(recipientType, recipientId);

    if (!isRecipientOnline) {
      const senderProfile = isSenderUser 
        ? await UserProfile.findOne({ user: req.actor.id }).select("fullName")
        : await CompanyProfile.findOne({ company: req.actor.id }).select("companyName");
      
      const senderName = isSenderUser 
        ? senderProfile?.fullName || "A user"
        : senderProfile?.companyName || "A company";

      const messagePreview = messageDoc.text 
        ? messageDoc.text.slice(0, 100) + (messageDoc.text.length > 100 ? "..." : "")
        : "Sent an attachment";

      await createNotification({
        userId: recipientType === "user" ? recipientId : undefined,
        companyId: recipientType === "company" ? recipientId : undefined,
        type: "message_received",
        title: `New message from ${senderName}`,
        message: messagePreview,
        data: {
          conversationId: convo._id,
          actionUrl: recipientType === "company" ? "/company/chat" : "/chat"
        },
        priority: "medium"
      });
    }

    return res.status(201).json({ message: messageDoc });
  } catch (err) {
    return res.status(500).json({ message: "Failed to send message" });
  }
}

export async function markRead(req, res) {
  try {
    const { conversationId } = req.params;
    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    const isUser = req.actor.type === "user";
    const isMember = (isUser && String(convo.user) === String(req.actor.id)) || (!isUser && String(convo.company) === String(req.actor.id));
    if (!isMember) return res.status(403).json({ message: "Not allowed" });

    const filter = {
      conversation: conversationId,
      readAt: { $exists: false },
      senderType: isUser ? "company" : "user"
    };
    await Message.updateMany(filter, { $set: { readAt: new Date() } });

    if (isUser) {
      convo.userUnreadCount = 0;
    } else {
      convo.companyUnreadCount = 0;
    }
    await convo.save();

    emitChatEvent("message:read", convo.user.toString(), convo.company.toString(), {
      conversationId: convo._id.toString(),
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to mark read" });
  }
}

export async function presence(req, res) {
  try {
    const { type, id } = req.params;
    if (!["user", "company"].includes(type)) return res.status(400).json({ message: "Invalid type" });
    const online = isActorOnline(type, id);
    return res.json({ online });
  } catch (e) {
    return res.status(500).json({ message: "Failed to get presence" });
  }
}


