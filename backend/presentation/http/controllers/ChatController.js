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

  /**
   * DELETE /api/chats/:chatId
   */
  async deleteChat(req, res) {
    const result = await this.chatService.deleteChat(req.user.id, req.params.chatId);
    res.status(200).json({ success: true, data: result });
  }

  /**
   * DELETE /api/chats/:chatId (alias)
   */
  async deleteGroupChat(req, res) {
    return this.deleteChat(req, res);
  }

  /**
   * DELETE /api/chats/:chatId/messages/:messageId
   */
  async deleteMessage(req, res) {
    const result = await this.messageService.deleteMessage({
      userId: req.user.id,
      chatId: req.params.chatId,
      messageId: req.params.messageId,
    });
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = ChatController;
