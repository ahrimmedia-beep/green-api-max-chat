# GREEN-API для MAX: что проверено по документации

Сверено с официальной документацией 03.10.2026. Ниже только то, что используется в приложении.

## Хост и формат запроса

- Адрес метода: `{{apiUrl}}/waInstance{{idInstance}}/{{method}}/{{apiTokenInstance}}`.
  Префикс `/v3/` для MAX теперь необязателен, но поддерживается для совместимости:
  `{{apiUrl}}/v3/waInstance{{idInstance}}/...`.
  [Выполнение запросов](https://green-api.com/v3/docs/request-format/),
  [Важные отличия v3](https://green-api.com/v3/docs/important-differences/).
- `apiUrl` выдаётся для каждого инстанса в личном кабинете вместе с `idInstance` и `apiTokenInstance`
  ([Перед началом работы](https://green-api.com/v3/docs/before-start/#parameters)).
  Пример из документации: `https://3100.api.green-api.com`. Поэтому в форме входа есть поле «API URL».
  Приложение подставляет его по первым четырём цифрам `idInstance` (`3100…` → `https://3100.api.green-api.com`):
  так выглядят адреса в консоли, но это соглашение, а не правило из документации. Значение из консоли надёжнее.
- Заголовок `Content-Type: application/json`.
- CORS: `api.green-api.com` и `3100.api.green-api.com` отвечают `Access-Control-Allow-Origin: *`,
  разрешены методы `GET, POST, OPTIONS, DELETE` и заголовок `Content-Type`. Браузер обращается к API напрямую,
  прокси не нужен (проверено запросами с заведомо неверными учётными данными).
- Ошибки авторизации на практике: на неверный токен API отвечает `401` с пустым телом, на неверный `idInstance` отвечает `403` с HTML-страницей nginx.
  Клиент не рассчитывает на JSON в теле ошибки.
  [Стандартные ошибки](https://green-api.com/v3/docs/api/common-errors/).

## Идентификатор чата в MAX

[Идентификатор чата](https://green-api.com/v3/docs/api/chat-id/):

- Личный чат: число в строке, например `"10000000"`. Групповой: отрицательное число, `"-10000000000000"`.
- Префиксы `@c.us` / `@g.us` в v3 не используются, ни в отправке, ни во входящих уведомлениях.
- Отправка по номеру `79991234567@c.us` оставлена для обратной совместимости и работает только для кодов `7` (РФ) и `375` (РБ).
  Документация прямо предупреждает: в этом случае сервер назначит другой chatId, и входящие сообщения придут с ним.
  Поэтому отправку по номеру можно использовать, только если ответы не нужны.
- Рекомендованный путь, который использует приложение: номер → `CheckAccount` → `chatId` → `SendMessage(chatId)`.
  Входящие сообщения приходят с тем же `senderData.chatId`, по нему они попадают в нужный чат.

## Методы

| Метод | HTTP | Путь | Тело / параметры | Ответ |
|---|---|---|---|---|
| [GetStateInstance](https://green-api.com/v3/docs/api/account/GetStateInstance/) | GET | `/waInstance{id}/getStateInstance/{token}` | нет | `{ "stateInstance": "authorized" }`, также `notAuthorized`, `blocked`, `starting`, `suspended`, `pendingPassword` |
| [CheckAccount](https://green-api.com/v3/docs/api/service/CheckAccount/) | POST | `/waInstance{id}/checkAccount/{token}` | `{ "phoneNumber": 79991234567 }` (число, 11 или 12 цифр, коды 7 и 375) | `{ "exist": true, "chatId": "10000000", "fromCache": true }`; при неавторизованном инстансе `{ "status": false, "reason": "..." }` |
| [SendMessage](https://green-api.com/v3/docs/api/sending/SendMessage/) | POST | `/waInstance{id}/sendMessage/{token}` | `{ "chatId": "10000000", "message": "текст" }`, до 4000 символов | `{ "idMessage": "1763115112345" }` |
| [GetContactInfo](https://green-api.com/v3/docs/api/service/GetContactInfo/) | POST | `/waInstance{id}/getContactInfo/{token}` | `{ "chatId": "10000000" }`, только личные чаты | `{ "avatar": "https://i.oneme.ru/...", "name": "...", "contactName": "...", "chatId": "10000000", "chatType": "user", "lastSeen": 1754632014, "phoneNumber": 79876543210 }` |
| [ReceiveNotification](https://green-api.com/v3/docs/api/receiving/technology-http-api/ReceiveNotification/) | GET | `/waInstance{id}/receiveNotification/{token}?receiveTimeout=N` | `receiveTimeout` от 5 до 60 с, по умолчанию 5 | `{ "receiptId": 1234567, "body": { ... } }` или `null`, если за таймаут ничего не пришло |
| [DeleteNotification](https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/) | DELETE | `/waInstance{id}/deleteNotification/{token}/{receiptId}` | нет | `{ "result": true, "reason": "" }` |

Лимиты запросов в секунду на инстанс ([ограничения](https://green-api.com/v3/docs/api/ratelimiter/)):
GetStateInstance 1, SendMessage 50, ReceiveNotification 100, DeleteNotification 100, CheckAccount 10, GetContactInfo 10.
На тарифе «Разработчик» действует ограничение на число чатов и проверок номеров (страница [MAX](https://green-api.com/max)).

## Имена и аватары собеседников

Для MAX в v3 есть три сервисных метода ([обзор](https://green-api.com/v3/docs/api/service/)):

- [GetContactInfo](https://green-api.com/v3/docs/api/service/GetContactInfo/) возвращает за один запрос и имя, и аватар:
  `name` (имя из профиля MAX, пусто, если аккаунта нет), `contactName` (имя из контактной книги телефона, пусто, если номера там нет),
  `avatar` (ссылка). Для групп не работает: `400 ... does not support group chats, to work with groups, use the GetGroupData method`.
- [GetAvatar](https://green-api.com/v3/docs/api/service/GetAvatar/): `POST` с `{ "chatId" }`, ответ `{ "urlAvatar": "..." }`;
  пустая строка, если аватара нет или он закрыт настройками приватности. Работает и для групп.
- [GetContacts](https://green-api.com/v3/docs/api/service/GetContacts/): список контактов, лимит 1 запрос в секунду.

Приложение использует только GetContactInfo: одного запроса хватает на имя и аватар.
Запрос отправляется один раз на chatId, когда чат создан по номеру или пришло сообщение от нового собеседника.
Имя выбирается так: `contactName`, затем `name`, затем имя из входящего уведомления (`senderData.senderContactName`,
`senderName`, `chatName`), затем номер, затем chatId. Ошибка запроса на переписку не влияет: остаются запасные варианты.
Картинка аватара грузится с `i.oneme.ru` обычным `<img>` без CORS; если она не загрузилась, показываются инициалы.

## Получение через HTTP API

[Технология HTTP API](https://green-api.com/v3/docs/api/receiving/technology-http-api/):

- Уведомления хранятся в очереди 24 часа и отдаются строго по порядку (FIFO).
- `ReceiveNotification` отдаёт первое уведомление очереди и ждёт до `receiveTimeout` секунд, если очередь пуста (long polling).
- Пока уведомление не удалено через `DeleteNotification`, следующий `ReceiveNotification` вернёт его же.
  Поэтому удалять нужно каждое полученное уведомление, в том числе тех типов, которые приложение не показывает.
- Условия: в настройках инстанса `webhookUrl` пустой и включены нужные типы уведомлений
  (`incomingWebhook`, при желании статусы). Иначе `ReceiveNotification` вернёт
  `400 Message cannot be received because custom webhook url is set`.

## Формат уведомлений, которые разбирает приложение

[Формат входящих уведомлений](https://green-api.com/v3/docs/api/receiving/notifications-format/),
[типы](https://green-api.com/v3/docs/api/receiving/notifications-format/type-webhook/).

Входящее сообщение (`typeWebhook = incomingMessageReceived`,
[описание](https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/Webhook-IncomingMessageReceived/)):

```json
{
  "typeWebhook": "incomingMessageReceived",
  "instanceData": { "idInstance": 3100000000, "wid": "79991234567@c.us", "typeInstance": "v3" },
  "timestamp": 1763115112,
  "idMessage": "1763115112345",
  "senderData": {
    "chatId": "10000000",
    "chatName": "Имя",
    "chatType": "user",
    "sender": "10000000",
    "senderName": "Имя",
    "senderType": "user",
    "senderContactName": "Имя",
    "senderPhoneNumber": 79876543210
  },
  "messageData": {
    "typeMessage": "textMessage",
    "textMessageData": { "textMessage": "Привет" }
  }
}
```

- `timestamp` в секундах UNIX.
- `senderPhoneNumber` число; `0`, если номер скрыт или это группа.
- Текст берётся из:
  - `textMessage` → `messageData.textMessageData.textMessage`
    ([текст](https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/TextMessage/));
  - `extendedTextMessage` → `messageData.extendedTextMessageData.text`
    ([текст с URL](https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/ExtendedTextMessage/));
  - `quotedMessage` → `messageData.extendedTextMessageData.text`
    ([цитата](https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/QuotedMessage/)).
- Остальные типы сообщений (изображения, файлы, реакции и т. д.) и остальные `typeWebhook`
  (`outgoingMessageReceived`, `outgoingAPIMessageReceived`, `stateInstanceChanged`, `quotaExceeded`)
  приложение пропускает, но из очереди удаляет.

Статус отправленного сообщения (`typeWebhook = outgoingMessageStatus`,
[описание](https://green-api.com/v3/docs/api/receiving/notifications-format/statuses/OutgoingMessageStatus/)):
поля `chatId`, `idMessage`, `status` (`delivered`, `read`, `failed`, `noAccount`, `notInGroup`), `description`.
Документация требует обязательно обрабатывать `failed` и `noAccount`: приложение помечает такое сообщение ошибкой.

## Что проверить на живом аккаунте

- Формат `apiUrl` в консоли для MAX-инстанса (с `/v3` на конце или без) и совпадение с подстановкой по `idInstance`.
- Что `senderData.chatId` во входящем сообщении совпадает с `chatId` из `CheckAccount` для того же номера.
- Как MAX-инстанс отвечает `ReceiveNotification` при пустой очереди: ожидается `null` с кодом 200.
- Что `GetContactInfo` работает на тарифе «Разработчик» и не расходует лимит проверок номеров,
  а ссылка на аватар открывается в браузере с чужого домена.
