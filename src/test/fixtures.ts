/** Примеры уведомлений из документации GREEN-API v3 (MAX). */

const instanceData = { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' }

const senderData = {
  chatId: '10000000',
  chatName: 'Ходабрыш Пробешёлов',
  chatType: 'user',
  sender: '10000000',
  senderName: 'Ходабрыш Пробешёлов',
  senderType: 'user',
  senderContactName: 'Ходабрыш Пробешёлов',
  senderPhoneNumber: 79876543210,
}

export function incomingText(text = 'Привет от Green-API!', overrides: Record<string, unknown> = {}) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: 1763115112,
    idMessage: '126543123451133331119',
    senderData,
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
    ...overrides,
  }
}

export const incomingExtendedText = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112345',
  senderData,
  messageData: {
    typeMessage: 'extendedTextMessage',
    extendedTextMessageData: {
      text: 'Документация на сайте https://green-api.com/',
      description: '',
      title: 'GREEN-API',
      forwardingScore: 0,
      isForwarded: false,
    },
  },
}

export const incomingQuoted = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1588091580,
  idMessage: '1763115112346',
  senderData,
  messageData: {
    typeMessage: 'quotedMessage',
    extendedTextMessageData: { text: 'Цитируем это', stanzaId: '116413118178426437', participant: '10000000' },
  },
}

export const incomingGroupText = {
  ...incomingText('Сообщение в группе'),
  idMessage: '1763115112347',
  senderData: {
    chatId: '-69876543210123',
    chatName: 'Название группы',
    chatType: 'group',
    sender: '10000000',
    senderName: 'Ходабрыш',
    senderType: 'user',
    senderContactName: '',
    senderPhoneNumber: 0,
  },
}

export const incomingImage = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112348',
  senderData,
  messageData: {
    typeMessage: 'imageMessage',
    fileMessageData: { downloadUrl: 'https://example.com/1.jpg', caption: '', mimeType: 'image/jpeg' },
  },
}

export function outgoingStatus(status: string, idMessage = '115054445839974415', description?: string) {
  return {
    typeWebhook: 'outgoingMessageStatus',
    chatId: '10000000',
    instanceData,
    timestamp: 1755591519,
    idMessage,
    status,
    ...(description === undefined ? {} : { description }),
  }
}

export const stateInstanceChanged = {
  typeWebhook: 'stateInstanceChanged',
  instanceData,
  timestamp: 1763115112,
  stateInstance: 'authorized',
}

export const outgoingApiMessage = {
  typeWebhook: 'outgoingAPIMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112349',
  senderData,
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'отправлено из API' } },
}
