const mongoose = require('mongoose');

const chatMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const lastMessageSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    title: {
      type: String,
      default: null,
      trim: true,
    },
    directKey: {
      type: String,
      default: undefined,
    },
    members: {
      type: [chatMemberSchema],
      default: [],
    },
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

chatSchema.index({ 'members.userId': 1, updatedAt: -1 });
chatSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: { directKey: { $type: 'string' } },
  }
);

module.exports = mongoose.models.Chat || mongoose.model('Chat', chatSchema);
