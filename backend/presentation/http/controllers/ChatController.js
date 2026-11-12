/**
 * HTTP controller for chat and message history endpoints.
 */
class ChatController {
  /**
   * @param {object} deps
   * @param {import('../../../application/services/ChatService')} deps.chatService
   * @param {import('../../../application/services/MessageService')} deps.messageService
   */
  constructor({ chatService, messageService }) {
    this.chatService = chatService;
    this.messageService = messageService;
  }

  /**
   * GET /api/chats
   */
  async getUserChats(req, res) {
    const chats = await this.chatService.getUserChats(req.user.id);
    res.status(200).json({ success: true, data: chats });
  }

  /**
   * POST /api/chats/direct
   */
  async createDirectChat(req, res) {
    const { targetUserId } = req.body || {};
    const chat = await this.chatService.getOrCreateDirectChat(req.user.id, targetUserId);
    res.status(200).json({ success: true, data: chat });
  }

  /**
   * POST /api/chats/group
   */
  async createGroupChat(req, res) {
    const { title, memberIds } = req.body || {};
    const chat = await this.chatService.createGroupChat(req.user.id, { title, memberIds });
    res.status(201).json({ success: true, data: chat });
  }

  /**
   * GET /api/chats/:chatId/messages?limit=&before=
   */
  async getMessages(req, res) {
    const { limit, before } = req.query || {};
    const messages = await this.messageService.getChatHistory(req.user.id, req.params.chatId, {
      limit,
      before,
    });
    res.status(200).json({ success: true, data: messages });
  }
}

module.exports = ChatController;
