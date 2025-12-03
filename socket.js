import { Server } from "socket.io";
import mongoose from "mongoose";
// Lazy model getters to avoid circular import issues
function getConversationModel() {
  try { return mongoose.model('Conversation'); } catch { return null; }
}

let ioInstance = null;
const connectedUsers = new Map();
// Track both users and companies using prefixed keys: u:<id>, c:<id>
function keyForActor(type, id) {
  return `${type === "company" ? "c" : "u"}:${id}`;
}

export function initSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  ioInstance.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    console.log("Current connected users:", Array.from(connectedUsers.keys()));
    
    // Backward compatibility: register with plain ID (assume user)
    socket.on("register", (idOrPayload) => {
      let key = null;
      let actorType = null;
      let actorId = null;
      
      console.log("Register event received:", idOrPayload);
      
      if (typeof idOrPayload === "string") {
        key = keyForActor("user", idOrPayload);
        actorType = "user";
        actorId = idOrPayload;
      } else if (idOrPayload && idOrPayload.id && idOrPayload.type) {
        key = keyForActor(idOrPayload.type, idOrPayload.id);
        actorType = idOrPayload.type;
        actorId = idOrPayload.id;
      }
      
      if (key) {
        console.log(`✅ Registering actor: ${key} with socket: ${socket.id}`);
        if (!connectedUsers.has(key)) connectedUsers.set(key, new Set());
        connectedUsers.get(key).add(socket.id);
        
        // Join the socket to the actor's room for Socket.IO broadcasting
        socket.join(key);
        console.log(`✅ Socket ${socket.id} joined room: ${key}`);
        
        console.log(`✅ Successfully registered. Total sockets for ${key}:`, connectedUsers.get(key).size);
        console.log(`📋 All connected actors:`, Array.from(connectedUsers.keys()));
        
        // Store actor info on socket for later use
        socket.actorKey = key;
        socket.actorType = actorType;
        socket.actorId = actorId;
        
        // Send confirmation back to client
        socket.emit("registered", { 
          actorKey: key, 
          actorType, 
          actorId,
          socketId: socket.id 
        });
        
        // Broadcast online status to all connected users
        ioInstance.emit("user:online", { 
          type: actorType, 
          id: actorId,
          isOnline: true 
        });
      } else {
        console.log("❌ Failed to register actor - invalid payload");
      }
    });

    socket.on("typing", ({ conversationId, to }) => {
      console.log(`Typing event received from socket ${socket.id}:`, { conversationId, to });
      
      // Emit to conversation room (scalable approach)
      if (conversationId) {
        const room = `conversation:${conversationId}`;
        socket.to(room).emit("typing", { conversationId });
        console.log(`Emitted typing to room: ${room}`);
      }
      
      // Also emit to direct recipient socket for backward compatibility
      if (to?.type && to?.id) {
        const recipientKey = keyForActor(to.type, to.id);
        const socketSet = connectedUsers.get(recipientKey);
        if (socketSet) {
          for (const sid of socketSet) {
            ioInstance.to(sid).emit("typing", { conversationId });
          }
          console.log(`Emitted typing to ${socketSet.size} direct socket(s) for ${recipientKey}`);
        } else {
          console.log(`No direct sockets found for ${recipientKey}`);
        }
      }
    });

    // Join a conversation room after server-side membership validation
    socket.on("conversation:join", async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const Conversation = getConversationModel();
        if (!Conversation) return;
        const convo = await Conversation.findById(conversationId).select('user company').lean();
        if (!convo) return;
        // Validate membership based on actor info stored during register
        const actorKey = socket.actorKey; // e.g., u:<id> or c:<id>
        if (!actorKey) return;
        const isUser = actorKey.startsWith('u:') && String(convo.user) === actorKey.slice(2);
        const isCompany = actorKey.startsWith('c:') && String(convo.company) === actorKey.slice(2);
        if (!isUser && !isCompany) {
          console.log(`conversation:join denied for socket ${socket.id} actor ${actorKey} convo ${conversationId}`);
          return;
        }
        const room = `conversation:${conversationId}`;
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
        socket.emit('conversation:joined', { conversationId, room });
      } catch (err) {
        console.error('Error in conversation:join:', err?.message || err);
      }
    });
    
    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
      const disconnectedActorKey = socket.actorKey;
      const disconnectedActorType = socket.actorType;
      const disconnectedActorId = socket.actorId;
      
      for (const [userId, socketSet] of connectedUsers.entries()) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          connectedUsers.delete(userId);
          
          // If this was the last socket for this user, broadcast offline status
          if (userId === disconnectedActorKey && disconnectedActorType && disconnectedActorId) {
            ioInstance.emit("user:offline", { 
              type: disconnectedActorType, 
              id: disconnectedActorId,
              isOnline: false 
            });
          }
        }
      }
    });
  });
}

export function emitNotification(userId, notification) {
  if (!ioInstance) {
    console.error("Socket.IO instance not initialized");
    return;
  }
  const socketSet = connectedUsers.get(keyForActor("user", userId?.toString()));
  if (socketSet) {
    console.log(
      `Emitting notification to user: ${userId}, sockets: ${[...socketSet]}`
    );
    for (const socketId of socketSet) {
      ioInstance.to(socketId).emit("notification", notification);
    }
  } else {
    console.log(`No sockets found for user: ${userId}`);
  }
}

// Broadcast a job update to all connected sockets (admins/frontends can listen)
export function emitJobUpdate(update) {
  if (!ioInstance) {
    console.error("Socket.IO instance not initialized");
    return;
  }
  try {
    ioInstance.emit("jobUpdate", update);
  } catch (err) {
    console.error("Error emitting jobUpdate:", err);
  }
}

// Chat utility: emit to both user and company actors
export function emitChatEvent(event, userId, companyId, payload) {
  if (!ioInstance) {
    console.error('emitChatEvent: Socket.IO instance not initialized');
    return;
  }
  console.log(`emitChatEvent: Emitting ${event} to user:${userId} and company:${companyId}`);
  console.log('emitChatEvent: Payload:', JSON.stringify(payload, null, 2));
  const userKey = keyForActor("user", userId);
  const companyKey = keyForActor("company", companyId);
  let emittedCount = 0;

  // Emit to actor direct sockets
  for (const key of [userKey, companyKey]) {
    const socketSet = connectedUsers.get(key);
    if (!socketSet) {
      console.log(`emitChatEvent: No sockets found for ${key}`);
      continue;
    }
    console.log(`emitChatEvent: Found ${socketSet.size} socket(s) for ${key}:`, [...socketSet]);
    for (const sid of socketSet) {
      ioInstance.to(sid).emit(event, payload);
      emittedCount++;
    }
  }

  // Emit to conversation room if conversationId present in payload
  const conversationId = payload?.conversationId;
  if (conversationId) {
    const room = `conversation:${conversationId}`;
    ioInstance.to(room).emit(event, payload);
    console.log(`emitChatEvent: Emitted event ${event} to room ${room}`);
  }

  // Defensive fallback: if user sockets missing but senderType is user, attempt emission to senderKey stored on payload.message
  const senderType = payload?.message?.senderType;
  if (senderType === 'user' && emittedCount === 0 && userId) {
    const altSet = connectedUsers.get(userKey);
    if (altSet) {
      for (const sid of altSet) ioInstance.to(sid).emit(event, payload);
      console.log('emitChatEvent: Fallback emission to userKey');
    }
  }
  console.log(`emitChatEvent: Total emissions (direct only): ${emittedCount}`);
}

export function isActorOnline(type, id) {
  const key = keyForActor(type, id);
  return connectedUsers.has(key) && connectedUsers.get(key)?.size > 0;
}

export function getAllOnlineActors() {
  const onlineActors = [];
  for (const [key, socketSet] of connectedUsers.entries()) {
    if (socketSet.size > 0) {
      const [typePrefix, id] = key.split(':');
      onlineActors.push({
        type: typePrefix === 'c' ? 'company' : 'user',
        id: id,
        isOnline: true
      });
    }
  }
  return onlineActors;
}

export function getIoInstance() {
  return ioInstance;
}

export function emitToActor(actorType, actorId, event, data) {
  // Convert ObjectId to string if needed
  const idString = actorId?.toString ? actorId.toString() : String(actorId);
  const key = keyForActor(actorType, idString);
  
  if (ioInstance) {
    const socketSet = connectedUsers.get(key);
    console.log(`📡 Emitting ${event} to ${key}:`, {
      actorIdType: typeof actorId,
      actorIdValue: idString,
      hasSocketSet: !!socketSet,
      socketCount: socketSet?.size || 0,
      connectedKeys: Array.from(connectedUsers.keys())
    });
    
    if (!socketSet || socketSet.size === 0) {
      console.warn(`⚠️ No sockets found for ${key}. User might be offline.`);
    }
    
    ioInstance.to(key).emit(event, data);
  } else {
    console.warn('⚠️ No ioInstance available for emitting');
  }
}
