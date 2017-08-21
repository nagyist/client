// @flow
import * as SearchConstants from './search'
import {createShallowEqualSelector} from './selectors'
import HiddenString from '../util/hidden-string'
import {Buffer} from 'buffer'
import {Set, List, Map, Record} from 'immutable'
import clamp from 'lodash/clamp'
import invert from 'lodash/invert'
import * as ChatTypes from './types/flow-types-chat'
import {getPath, getPathState} from '../route-tree'
import {chatTab} from './tabs'
import {createSelector} from 'reselect'
import {parseUserId, serviceIdToIcon} from '../util/platforms'

import type {UserListItem} from '../common-adapters/usernames'
import type {Path} from '../route-tree'
import type {NoErrorTypedAction, TypedAction} from './types/flux'
import type {
  Asset,
  AssetMetadata,
  ChatActivity,
  ConversationInfoLocal,
  ConversationFinalizeInfo,
  MessageBody,
  MessageID as RPCMessageID,
  OutboxID as RPCOutboxID,
  ConversationID as RPCConversationID,
  TyperInfo,
  ConversationStaleUpdate,
} from './types/flow-types-chat'
import type {DeviceType, KBRecord} from './types/more'
import type {TypedState} from './reducer'

export type Username = string
export type MessageKey = string
type MessageKeyKind =
  | 'chatSecured'
  | 'error'
  | 'errorInvisible'
  | 'header'
  | 'messageIDAttachment'
  | 'messageIDDeleted'
  | 'messageIDEdit'
  | 'messageIDAttachmentUpdate'
  | 'messageIDError'
  | 'messageIDText'
  | 'messageIDUnhandled'
  | 'outboxIDAttachment'
  | 'outboxIDText'
  | 'tempAttachment'
  | 'timestamp'
  | 'supersedes'

export type MessageType = 'Text'
export type FollowingMap = {[key: string]: true}

export type MessageState = 'pending' | 'failed' | 'sent'
export const messageStates: Array<MessageState> = ['pending', 'failed', 'sent']

export type AttachmentMessageState = MessageState | 'placeholder' | 'uploading'
export type AttachmentType = 'Image' | 'Video' | 'Other'

export type ConversationID = RPCConversationID
export type ConversationIDKey = string

export type OutboxID = RPCOutboxID
export type OutboxIDKey = string

export type MessageID = RPCMessageID

export type TextMessage = {
  type: 'Text',
  message: HiddenString,
  author: string,
  deviceName: string,
  deviceType: DeviceType,
  timestamp: number,
  conversationIDKey: ConversationIDKey,
  messageID?: MessageID,
  you: string,
  messageState: MessageState,
  failureDescription: ?string,
  outboxID?: ?OutboxIDKey,
  senderDeviceRevokedAt: ?number,
  key: MessageKey,
  editedCount: number, // increase as we edit it
}

export type ErrorMessage = {
  type: 'Error',
  reason: string,
  timestamp?: number,
  conversationIDKey: ConversationIDKey,
  messageID?: MessageID,
  key: MessageKey,
}

export type InvisibleErrorMessage = {
  type: 'InvisibleError',
  timestamp: number,
  conversationIDKey: ConversationIDKey,
  messageID: MessageID,
  key: MessageKey,
  data: any,
}

export type UnhandledMessage = {
  type: 'Unhandled',
  timestamp: number,
  conversationIDKey: ConversationIDKey,
  messageID: MessageID,
  key: MessageKey,
}

export type AttachmentSize = {
  width: number,
  height: number,
}

export type AttachmentInput = {
  conversationIDKey: ConversationIDKey,
  filename: string,
  title: string,
  type: AttachmentType,
}

export type AttachmentMessage = {
  type: 'Attachment',
  timestamp: number,
  conversationIDKey: ConversationIDKey,
  you: string,
  author: string,
  deviceName: string,
  deviceType: DeviceType,
  messageID?: MessageID,
  filename: ?string,
  title: ?string,
  attachmentDurationMs: ?number,
  previewType: ?AttachmentType,
  previewSize: ?AttachmentSize,
  previewDurationMs: ?number,
  uploadPath?: string,
  outboxID?: ?OutboxIDKey,
  messageState: AttachmentMessageState,
  senderDeviceRevokedAt: ?number,
  key: MessageKey,
  failureDescription?: ?string,
}

export type TimestampMessage = {
  type: 'Timestamp',
  timestamp: number,
  key: MessageKey,
}

export type LoadingMoreMessage = {
  type: 'LoadingMore',
  key: MessageKey,
}

export type ChatSecuredHeaderMessage = {
  type: 'ChatSecuredHeader',
  key: MessageKey,
}

export type SupersedesMessage = {
  type: 'Supersedes',
  username: string,
  timestamp: number,
  supersedes: ConversationIDKey,
  key: any,
}

export type DeletedMessage = {
  type: 'Deleted',
  timestamp: number,
  key: MessageKey,
  messageID: MessageID,
  deletedIDs: Array<MessageID>,
}

export type EditingMessage = {
  type: 'Edit',
  key: MessageKey,
  message: HiddenString,
  messageID: MessageID,
  outboxID?: ?OutboxIDKey,
  targetMessageID: MessageID,
  timestamp: number,
}

export type UpdatingAttachment = {
  type: 'UpdateAttachment',
  key: MessageKey,
  messageID: MessageID,
  targetMessageID: MessageID,
  timestamp: number,
  updates: {
    attachmentDurationMs: ?number,
    filename: ?string,
    messageState: 'sent',
    previewType: ?AttachmentType,
    previewSize: ?AttachmentSize,
    previewDurationMs: ?number,
    title: ?string,
  },
}

export type ClientMessage =
  | TimestampMessage
  | SupersedesMessage
  | LoadingMoreMessage
  | ChatSecuredHeaderMessage
export type ServerMessage =
  | TextMessage
  | ErrorMessage
  | AttachmentMessage
  | DeletedMessage
  | UnhandledMessage
  | EditingMessage
  | UpdatingAttachment
  | InvisibleErrorMessage

// TODO (mm) fix this
export type Message = any // ClientMessage | ServerMessage

export type MaybeTimestamp = TimestampMessage | null

export const ConversationStatusByEnum = invert(ChatTypes.CommonConversationStatus)

export const ConversationStateRecord = Record({
  // Is this used?
  messageKeys: List(),
  messages: List(),
  seenMessages: Set(),
  moreToLoad: undefined,
  isLoaded: false,
  isRequesting: false,
  isStale: false,
  loadedOffline: false,
  paginationNext: undefined,
  paginationPrevious: undefined,
  firstNewMessageID: undefined,
  deletedIDs: Set(),
  typing: Set(),
})

export type ConversationState = KBRecord<{
  messageKeys: List<MessageKey>,
  // TODO del
  messages: List<Message>,
  seenMessages: Set<MessageID>,
  moreToLoad: ?boolean,
  isRequesting: boolean,
  isStale: boolean,
  loadedOffline: boolean,
  paginationNext: ?Buffer,
  paginationPrevious: ?Buffer,
  firstNewMessageID: ?MessageID,
  deletedIDs: Set<MessageID>,
  typing: Set<Username>,
}>

export type ConversationBadgeState = KBRecord<{
  convID: ConversationID,
  unreadMessages: number,
}>

export const ConversationBadgeStateRecord = Record({
  convID: undefined,
  unreadMessages: 0,
})

export type ConversationStateEnum = $Keys<typeof ChatTypes.CommonConversationStatus>

export const InboxStateRecord = Record({
  conversationIDKey: '',
  info: null,
  isEmpty: false,
  participants: List(),
  snippet: '',
  snippetKey: null,
  state: 'untrusted',
  status: 'unfiled',
  time: 0,
})

export type InboxState = KBRecord<{
  conversationIDKey: ConversationIDKey,
  info: ConversationInfoLocal,
  isEmpty: boolean,
  participants: List<string>,
  snippet: string,
  snippetKey: any,
  state: 'untrusted' | 'unboxed' | 'error' | 'unboxing',
  status: ConversationStateEnum,
  time: number,
}>

export type SupersedeInfo = {
  conversationIDKey: ConversationID,
  finalizeInfo: ConversationFinalizeInfo,
}

export type FinalizeInfo = ConversationFinalizeInfo

export type FinalizedState = Map<ConversationIDKey, ConversationFinalizeInfo>

export type SupersedesState = Map<ConversationIDKey, SupersedeInfo>
export type SupersededByState = Map<ConversationIDKey, SupersedeInfo>

export type MetaData = KBRecord<{
  fullname: string,
  brokenTracker: boolean,
}>

export type MetaDataMap = Map<string, MetaData>

export const MetaDataRecord = Record({
  fullname: 'Unknown',
  brokenTracker: false,
})

export type Participants = List<string>

export const RekeyInfoRecord = Record({
  rekeyParticipants: List(),
  youCanRekey: false,
})

export type RekeyInfo = KBRecord<{
  rekeyParticipants: Participants,
  youCanRekey: boolean,
}>

export type LocalMessageStateProps = {
  previewProgress: number | null /* between 0 - 1 */,
  downloadProgress: number | null /* between 0 - 1 */,
  uploadProgress: number | null /* between 0 - 1 */,
  previewPath: ?string,
  downloadedPath: ?string,
  savedPath: string | null | false,
}

const LocalMessageState: (
  props: $Shape<LocalMessageStateProps>
) => KBRecord<LocalMessageStateProps> = Record({
  previewProgress: null,
  downloadProgress: null,
  uploadProgress: null,
  previewPath: null,
  downloadedPath: null,
  savedPath: null,
})

const defaultLocalMessageState = new LocalMessageState({})

const getLocalMessageStateFromMessageKey = (state: TypedState, messageKey: MessageKey): ?Message =>
  state.chat.localMessageStates.get(messageKey, defaultLocalMessageState)

// $FlowIssue with cast
export const StateRecord: KBRecord<T> = Record({
  messageMap: Map(),
  localMessageStates: Map(),
  inbox: List(),
  inboxFilter: List(),
  inboxSearch: List(),
  conversationStates: Map(),
  metaData: Map(),
  finalizedState: Map(),
  supersedesState: Map(),
  supersededByState: Map(),
  conversationUnreadCounts: Map(),
  rekeyInfos: Map(),
  alwaysShow: Set(),
  pendingConversations: Map(),
  nowOverride: null,
  editingMessage: null,
  initialConversation: null,
  inboxUntrustedState: 'unloaded',
  previousConversation: null,
  searchPending: false,
  searchResults: null,
  searchShowingSuggestions: false,
  selectedUsersInSearch: List(),
  inSearch: false,
  tempPendingConversations: Map(),
  searchResultTerm: '',
})

export type UntrustedState = 'unloaded' | 'loaded' | 'loading'

export type State = KBRecord<{
  // TODO  move to entities
  messageMap: Map<MessageKey, Message>,
  localMessageStates: Map<MessageKey, LocalMessageState>,
  inbox: List<InboxState>,
  inboxFilter: List<string>,
  inboxSearch: List<string>,
  conversationStates: Map<ConversationIDKey, ConversationState>,
  finalizedState: FinalizedState,
  supersedesState: SupersedesState,
  supersededByState: SupersededByState,
  metaData: MetaDataMap,
  conversationUnreadCounts: Map<ConversationIDKey, number>,
  rekeyInfos: Map<ConversationIDKey, RekeyInfo>,
  alwaysShow: Set<ConversationIDKey>,
  pendingConversations: Map<ConversationIDKey, Participants>,
  tempPendingConversations: Map<ConversationIDKey, boolean>,
  nowOverride: ?Date,
  editingMessage: ?Message,
  initialConversation: ?ConversationIDKey,
  inboxUntrustedState: UntrustedState,
  previousConversation: ?ConversationIDKey,
  searchPending: boolean,
  searchResults: ?List<SearchConstants.SearchResultId>,
  searchShowingSuggestions: boolean,
  selectedUsersInSearch: List<SearchConstants.SearchResultId>,
  inSearch: boolean,
  searchResultTerm: string,
}>

export const maxAttachmentPreviewSize = 320

export const howLongBetweenTimestampsMs = 1000 * 60 * 15
export const maxMessagesToLoadAtATime = 50

export const nothingSelected = 'chat:noneSelected'
export const blankChat = 'chat:blankChat'

export type AddPendingConversation = NoErrorTypedAction<
  'chat:addPendingConversation',
  {participants: Array<string>, temporary: boolean}
>

export type AppendMessages = NoErrorTypedAction<
  'chat:appendMessages',
  {
    conversationIDKey: ConversationIDKey,
    isAppFocused: boolean,
    isSelected: boolean,
    messages: Array<Message>,
    svcShouldDisplayNotification: boolean,
  }
>
export type BadgeAppForChat = NoErrorTypedAction<'chat:badgeAppForChat', List<ConversationBadgeState>>
export type BlockConversation = NoErrorTypedAction<
  'chat:blockConversation',
  {
    blocked: boolean,
    conversationIDKey: ConversationIDKey,
    reportUser: boolean,
  }
>
export type ClearMessages = NoErrorTypedAction<'chat:clearMessages', {conversationIDKey: ConversationIDKey}>
export type ClearSearchResults = NoErrorTypedAction<'chat:clearSearchResults', {}>
export type ClearRekey = NoErrorTypedAction<'chat:clearRekey', {conversationIDKey: ConversationIDKey}>
export type DeleteMessage = NoErrorTypedAction<'chat:deleteMessage', {message: Message}>
export type EditMessage = NoErrorTypedAction<'chat:editMessage', {message: Message, text: HiddenString}>
export type ExitSearch = NoErrorTypedAction<'chat:exitSearch', {}>
export type GetInboxAndUnbox = NoErrorTypedAction<
  'chat:getInboxAndUnbox',
  {conversationIDKeys: Array<ConversationIDKey>}
>
export type InboxStale = NoErrorTypedAction<'chat:inboxStale', void>
export type IncomingMessage = NoErrorTypedAction<'chat:incomingMessage', {activity: ChatActivity}>
export type IncomingTyping = NoErrorTypedAction<'chat:incomingTyping', {activity: TyperInfo}>
export type LoadInbox = NoErrorTypedAction<'chat:loadInbox', void>
export type LoadMoreMessages = NoErrorTypedAction<
  'chat:loadMoreMessages',
  {conversationIDKey: ConversationIDKey, onlyIfUnloaded: boolean}
>
export type LoadedInbox = NoErrorTypedAction<'chat:loadedInbox', {inbox: List<InboxState>}>
export type LoadingMessages = NoErrorTypedAction<
  'chat:loadingMessages',
  {conversationIDKey: ConversationIDKey, isRequesting: boolean}
>
export type MarkThreadsStale = NoErrorTypedAction<
  'chat:markThreadsStale',
  {updates: Array<ConversationStaleUpdate>}
>
export type MuteConversation = NoErrorTypedAction<
  'chat:muteConversation',
  {conversationIDKey: ConversationIDKey, muted: boolean}
>
export type NewChat = NoErrorTypedAction<'chat:newChat', {existingParticipants: Array<string>}>
export type OpenAttachmentPopup = NoErrorTypedAction<
  'chat:openAttachmentPopup',
  {message: AttachmentMessage, currentPath: Path}
>
export type OpenConversation = NoErrorTypedAction<
  'chat:openConversation',
  {conversationIDKey: ConversationIDKey}
>
export type OpenFolder = NoErrorTypedAction<'chat:openFolder', void>
export type OpenTlfInChat = NoErrorTypedAction<'chat:openTlfInChat', string>
export type PendingToRealConversation = NoErrorTypedAction<
  'chat:pendingToRealConversation',
  {oldKey: ConversationIDKey, newKey: ConversationIDKey}
>
export type PostMessage = NoErrorTypedAction<
  'chat:postMessage',
  {conversationIDKey: ConversationIDKey, text: HiddenString}
>
export type PrependMessages = NoErrorTypedAction<
  'chat:prependMessages',
  {
    conversationIDKey: ConversationIDKey,
    messages: Array<Message>,
    moreToLoad: boolean,
    paginationNext: ?Buffer,
  }
>
export type RemoveOutboxMessage = NoErrorTypedAction<
  'chat:removeOutboxMessage',
  {conversationIDKey: ConversationIDKey, outboxID: OutboxIDKey}
>
export type ReplaceConversation = NoErrorTypedAction<
  'chat:replaceConversation',
  {oldKey: ConversationIDKey, newKey: ConversationIDKey}
>
export type RemoveTempPendingConversations = NoErrorTypedAction<'chat:removeTempPendingConversations', void>
export type RetryMessage = NoErrorTypedAction<
  'chat:retryMessage',
  {conversationIDKey: ConversationIDKey, outboxIDKey: OutboxIDKey}
>
export type SelectConversation = NoErrorTypedAction<
  'chat:selectConversation',
  {conversationIDKey: ?ConversationIDKey, fromUser: boolean}
>
export type SetInboxFilter = NoErrorTypedAction<'chat:inboxFilter', {filter: Array<string>}>
export type SetInboxSearch = NoErrorTypedAction<'chat:inboxSearch', {search: Array<string>}>
export type SetInboxUntrustedState = NoErrorTypedAction<
  'chat:inboxUntrustedState',
  {inboxUntrustedState: UntrustedState}
>
export type SetInitialConversation = NoErrorTypedAction<
  'chat:setInitialConversation',
  {conversationIDKey: ?ConversationIDKey}
>
export type SetPreviousConversation = NoErrorTypedAction<
  'chat:setPreviousConversation',
  {conversationIDKey: ?ConversationIDKey}
>
export type SetLoaded = NoErrorTypedAction<
  'chat:setLoaded',
  {conversationIDKey: ConversationIDKey, isLoaded: boolean}
>
export type SetUnboxing = TypedAction<
  'chat:setUnboxing',
  {conversationIDKeys: Array<ConversationIDKey>},
  {conversationIDKeys: Array<ConversationIDKey>}
>
export type SetupChatHandlers = NoErrorTypedAction<'chat:setupChatHandlers', void>
export type ShowEditor = NoErrorTypedAction<'chat:showEditor', {message: ?Message}>
export type StageUserForSearch = NoErrorTypedAction<
  'chat:stageUserForSearch',
  {user: SearchConstants.SearchResultId}
>
export type StartConversation = NoErrorTypedAction<
  'chat:startConversation',
  {users: Array<string>, forceImmediate: boolean, temporary: boolean}
>
export type UnboxInbox = NoErrorTypedAction<
  'chat:updateSupersededByState',
  {conversationIDKeys: Array<ConversationIDKey>}
>
export type UnstageUserForSearch = NoErrorTypedAction<
  'chat:unstageUserForSearch',
  {user: SearchConstants.SearchResultId}
>
export type UntrustedInboxVisible = NoErrorTypedAction<
  'chat:untrustedInboxVisible',
  {conversationIDKey: ConversationIDKey, rowsVisible: number}
>
export type UpdateBadging = NoErrorTypedAction<'chat:updateBadging', {conversationIDKey: ConversationIDKey}>
export type UpdateConversationUnreadCounts = NoErrorTypedAction<
  'chat:updateConversationUnreadCounts',
  {conversationUnreadCounts: Map<ConversationIDKey, number>}
>
export type UpdateFinalizedState = NoErrorTypedAction<
  'chat:updateFinalizedState',
  {finalizedState: FinalizedState}
>
export type UpdateInbox = NoErrorTypedAction<'chat:updateInbox', {conversation: InboxState}>
export type UpdateInboxComplete = NoErrorTypedAction<'chat:updateInboxComplete', void>
export type UpdateInboxRekeyOthers = NoErrorTypedAction<
  'chat:updateInboxRekeyOthers',
  {conversationIDKey: ConversationIDKey, rekeyers: Array<string>}
>
export type UpdateInboxRekeySelf = NoErrorTypedAction<
  'chat:updateInboxRekeySelf',
  {conversationIDKey: ConversationIDKey}
>
export type UpdateLatestMessage = NoErrorTypedAction<
  'chat:updateLatestMessage',
  {conversationIDKey: ConversationIDKey}
>
export type UpdateMessage = NoErrorTypedAction<
  'chat:updateMessage',
  {
    conversationIDKey: ConversationIDKey,
    message: $Shape<AttachmentMessage> | $Shape<TextMessage>,
    messageID: MessageID,
  }
>
export type UpdateMetadata = NoErrorTypedAction<'chat:updateMetadata', {users: Array<string>}>
export type UpdatePaginationNext = NoErrorTypedAction<
  'chat:updatePaginationNext',
  {conversationIDKey: ConversationIDKey, paginationNext: Buffer}
>
export type UpdateSupersededByState = NoErrorTypedAction<
  'chat:updateSupersededByState',
  {supersededByState: SupersededByState}
>
export type UpdateSupersedesState = NoErrorTypedAction<
  'chat:updateSupersedesState',
  {supersedesState: SupersedesState}
>
export type UpdatedMetadata = NoErrorTypedAction<'chat:updatedMetadata', {updated: {[key: string]: MetaData}}>
export type UpdateTyping = NoErrorTypedAction<
  'chat:updateTyping',
  {conversationIDKey: ConversationIDKey, typing: boolean}
>

export type ThreadLoadedOffline = NoErrorTypedAction<
  'chat:threadLoadedOffline',
  {conversationIDKey: ConversationIDKey}
>

export type SelectAttachment = NoErrorTypedAction<'chat:selectAttachment', {input: AttachmentInput}>
export type RetryAttachment = NoErrorTypedAction<
  'chat:retryAttachment',
  {input: AttachmentInput, oldOutboxID: OutboxIDKey}
>
export type UpdateBrokenTracker = NoErrorTypedAction<
  'chat:updateBrokenTracker',
  {userToBroken: {[username: string]: boolean}}
>
export type UploadProgress = NoErrorTypedAction<
  'chat:uploadProgress',
  {
    messageKey: MessageKey,
    progress: ?number,
  }
>
export type DownloadProgress = NoErrorTypedAction<
  'chat:downloadProgress',
  {
    progress: ?number,
    isPreview: boolean,
    messageKey: MessageKey,
  }
>
export type LoadAttachment = NoErrorTypedAction<
  'chat:loadAttachment',
  {
    messageKey: MessageKey,
    loadPreview: boolean,
  }
>
export type SaveAttachment = NoErrorTypedAction<
  'chat:saveAttachment',
  {
    messageKey: MessageKey,
  }
>
export type AttachmentSaveStart = NoErrorTypedAction<
  'chat:attachmentSaveStart',
  {
    messageKey: MessageKey,
  }
>
export type AttachmentSaveFailed = NoErrorTypedAction<
  'chat:attachmentSaveFailed',
  {
    messageKey: MessageKey,
  }
>
export type LoadAttachmentPreview = NoErrorTypedAction<
  'chat:loadAttachmentPreview',
  {
    messageKey: MessageKey,
  }
>
export type AttachmentLoaded = NoErrorTypedAction<
  'chat:attachmentLoaded',
  {
    messageKey: MessageKey,
    isPreview: boolean,
    path: ?string,
  }
>
export type AttachmentSaved = NoErrorTypedAction<
  'chat:attachmentSaved',
  {
    messageKey: MessageKey,
    path: ?string,
  }
>
export type UpdateTempMessage = TypedAction<
  'chat:updateTempMessage',
  {
    conversationIDKey: ConversationIDKey,
    outboxID: OutboxIDKey,
    message: $Shape<AttachmentMessage> | $Shape<TextMessage>,
  },
  {
    conversationIDKey: ConversationIDKey,
    outboxID: OutboxIDKey,
    error: Error,
  }
>

export type OutboxMessageBecameReal = NoErrorTypedAction<
  'chat:outboxMessageBecameReal',
  {
    oldMessageKey: MessageKey,
    newMessageKey: MessageKey,
  }
>

export type MarkSeenMessage = NoErrorTypedAction<
  'chat:markSeenMessage',
  {
    conversationIDKey: ConversationIDKey,
    messageKey: MessageKey,
  }
>

export type SaveAttachmentNative = NoErrorTypedAction<
  'chat:saveAttachmentNative',
  {
    messageKey: MessageKey,
  }
>

export type ShareAttachment = NoErrorTypedAction<
  'chat:shareAttachment',
  {
    messageKey: MessageKey,
  }
>

export type UpdateThread = NoErrorTypedAction<
  'chat:updateThread',
  {
    thread: ChatTypes.ThreadView,
    yourName: string,
    yourDeviceName: string,
    conversationIDKey: string,
  }
>

export type UpdateSearchResults = SearchConstants.UpdateSearchResultsGeneric<'chat:updateSearchResults'>

export type Actions =
  | AddPendingConversation
  | AppendMessages
  | ClearRekey
  | DeleteMessage
  | EditMessage
  | ShowEditor
  | LoadInbox
  | LoadMoreMessages
  | LoadedInbox
  | NewChat
  | OpenFolder
  | PendingToRealConversation
  | PrependMessages
  | RemoveTempPendingConversations
  | SelectConversation
  | StartConversation
  | UpdateBadging
  | UpdateBrokenTracker
  | UpdateInbox
  | UpdateInboxComplete
  | UpdateLatestMessage
  | UpdateMetadata
  | UpdatedMetadata
  | UpdateTempMessage
  | MarkSeenMessage
  | AttachmentLoaded
  | UpdateFinalizedState
  | UpdateSearchResults
  | UpdateSupersededByState
  | UpdateSupersedesState

function conversationIDToKey(conversationID: ConversationID): ConversationIDKey {
  return conversationID.toString('hex')
}

function keyToConversationID(key: ConversationIDKey): ConversationID {
  return Buffer.from(key, 'hex')
}

function outboxIDToKey(outboxID: OutboxID): OutboxIDKey {
  return outboxID.toString('hex')
}

function keyToOutboxID(key: OutboxIDKey): OutboxID {
  return Buffer.from(key, 'hex')
}

function makeSnippet(messageBody: ?MessageBody): ?string {
  if (!messageBody) {
    return null
  }
  switch (messageBody.messageType) {
    case ChatTypes.CommonMessageType.text:
      return textSnippet(messageBody.text && messageBody.text.body, 100)
    case ChatTypes.CommonMessageType.attachment:
      return messageBody.attachment ? textSnippet(messageBody.attachment.object.title, 100) : 'Attachment'
    default:
      return null
  }
}

function makeTeamTitle(messageBody: ?MessageBody): ?string {
  if (!messageBody) {
    return null
  }
  switch (messageBody.messageType) {
    case ChatTypes.CommonMessageType.metadata:
      return messageBody.metadata ? `#${messageBody.metadata.conversationTitle}` : '<none>'
    default:
      return null
  }
}

// This is emoji aware hence all the weird ... stuff. See https://mathiasbynens.be/notes/javascript-unicode#iterating-over-symbols
function textSnippet(message: ?string = '', max: number) {
  // $FlowIssue flow doesn't understand spread + strings
  return [...message.substring(0, max * 4).replace(/\s+/g, ' ')].slice(0, max).join('')
}

// Filters out myself from most of our views of the list, unless the list is just me
function participantFilter(participants: List<string>, you: string): List<string> {
  const withoutYou = participants.filter(p => p !== you)
  if (withoutYou.count() === 0) {
    return participants
  }
  return withoutYou
}

function serverMessageToMessageBody(message: ServerMessage): ?MessageBody {
  switch (message.type) {
    case 'Text':
      return {
        messageType: ChatTypes.CommonMessageType.text,
        text: {
          body: message.message.stringValue(),
        },
      }
    default:
      return null
  }
}

function usernamesToUserListItem(
  usernames: Array<string>,
  you: string,
  metaDataMap: MetaDataMap,
  followingMap: FollowingMap
): Array<UserListItem> {
  return usernames.map(username => ({
    username,
    broken: metaDataMap.get(username, Map()).get('brokenTracker', false),
    you: username === you,
    following: !!followingMap[username],
  }))
}

function getBrokenUsers(participants: Array<string>, you: string, metaDataMap: MetaDataMap): Array<string> {
  return participants.filter(user => user !== you && metaDataMap.get(user, Map()).get('brokenTracker', false))
}

function clampAttachmentPreviewSize({width, height}: AttachmentSize) {
  if (height > width) {
    return {
      height: clamp(height, maxAttachmentPreviewSize),
      width: clamp(height, maxAttachmentPreviewSize) * width / height,
    }
  } else {
    return {
      height: clamp(width, maxAttachmentPreviewSize) * height / width,
      width: clamp(width, maxAttachmentPreviewSize),
    }
  }
}

function parseMetadataPreviewSize(metadata: AssetMetadata): ?AttachmentSize {
  if (metadata.assetType === ChatTypes.LocalAssetMetadataType.image && metadata.image) {
    return clampAttachmentPreviewSize(metadata.image)
  } else if (metadata.assetType === ChatTypes.LocalAssetMetadataType.video && metadata.video) {
    return clampAttachmentPreviewSize(metadata.video)
  }
}

function getAssetDuration(assetMetadata: ?AssetMetadata): ?number {
  const assetIsVideo = assetMetadata && assetMetadata.assetType === ChatTypes.LocalAssetMetadataType.video
  if (assetIsVideo) {
    const assetVideoMetadata =
      assetMetadata &&
      assetMetadata.assetType === ChatTypes.LocalAssetMetadataType.video &&
      assetMetadata.video
    return assetVideoMetadata ? assetVideoMetadata.durationMs : null
  }
  return null
}

function getAttachmentInfo(preview: ?(Asset | ChatTypes.MakePreviewRes), object: ?Asset) {
  const filename = object && object.filename
  const title = object && object.title

  const mimeType = preview && preview.mimeType
  const previewType = mimeType && mimeType.indexOf('image') === 0 ? 'Image' : 'Other'

  const previewMetadata = preview && preview.metadata
  const previewSize = previewMetadata && parseMetadataPreviewSize(previewMetadata)
  const previewDurationMs = getAssetDuration(previewMetadata)

  const objectMetadata = object && object.metadata
  const attachmentDurationMs = getAssetDuration(objectMetadata)

  return {
    attachmentDurationMs,
    filename,
    title,
    previewDurationMs,
    previewSize,
    previewType,
  }
}

function pendingConversationIDKey(tlfName: string) {
  return `__PendingConversation__${tlfName}`
}

function isPendingConversationIDKey(conversationIDKey: string) {
  return conversationIDKey.startsWith('__PendingConversation__')
}

function pendingConversationIDKeyToTlfName(conversationIDKey: string) {
  if (isPendingConversationIDKey(conversationIDKey)) {
    return conversationIDKey.substring('__PendingConversation__'.length)
  }

  return null
}

function convSupersedesInfo(conversationID: ConversationIDKey, chat: State): ?SupersedeInfo {
  return chat.get('supersedesState').get(conversationID)
}

function convSupersededByInfo(conversationID: ConversationIDKey, chat: State): ?SupersedeInfo {
  return chat.get('supersededByState').get(conversationID)
}

function newestConversationIDKey(conversationIDKey: ?ConversationIDKey, chat: State): ?ConversationIDKey {
  const supersededBy = chat.get('supersededByState').get(conversationIDKey)
  if (!supersededBy) {
    return conversationIDKey
  }

  return newestConversationIDKey(supersededBy.conversationIDKey, chat)
}

const getSelectedConversation = (state: TypedState) => {
  const chatPath = getPath(state.routeTree.routeState, [chatTab])
  if (chatPath.get(0) !== chatTab) {
    return null
  }
  const selected = chatPath.get(1)
  if (selected === nothingSelected) {
    return null
  }
  return selected
}

const getSelectedRouteState = (state: TypedState) => {
  const selected = getSelectedConversation(state)
  if (!selected) return null
  return getPathState(state.routeTree.routeState, [chatTab, selected])
}

function messageKey(
  conversationIDKey: ConversationIDKey,
  kind: MessageKeyKind,
  value: string | number
): MessageKey {
  return `${conversationIDKey}:${kind}:${value}`
}

function splitMessageIDKey(
  key: MessageKey
): {
  conversationIDKey: ConversationIDKey,
  keyKind: string,
  messageID: MessageID,
} {
  const [conversationIDKey, keyKind, messageIDStr] = key.split(':')
  const messageID: MessageID = Number(messageIDStr)
  return {conversationIDKey, keyKind, messageID}
}

function messageKeyValue(key: MessageKey): string {
  return key.split(':')[2]
}

function messageKeyConversationIDKey(key: MessageKey): ConversationIDKey {
  return key.split(':')[0]
}

function messageKeyKind(key: MessageKey): MessageKeyKind {
  const [, kind] = key.split(':')
  switch (kind) {
    case 'error':
      return 'error'
    case 'errorInvisible':
      return 'errorInvisible'
    case 'header':
      return 'header'
    case 'messageIDAttachment':
      return 'messageIDAttachment'
    case 'messageIDAttachmentUpdate':
      return 'messageIDAttachmentUpdate'
    case 'messageIDDeleted':
      return 'messageIDDeleted'
    case 'messageIDEdit':
      return 'messageIDEdit'
    case 'messageIDError':
      return 'messageIDError'
    case 'messageIDText':
      return 'messageIDText'
    case 'messageIDUnhandled':
      return 'messageIDUnhandled'
    case 'outboxIDText':
      return 'outboxIDText'
    case 'outboxIDAttachment':
      return 'outboxIDAttachment'
    case 'tempAttachment':
      return 'tempAttachment'
    case 'timestamp':
      return 'timestamp'
    case 'supersedes':
      return 'supersedes'
  }
  throw new Error(`Invalid messageKeyKind passed key: ${key}`)
}

const getYou = (state: TypedState) => state.config.username || ''
const getFollowingMap = (state: TypedState) => state.config.following
const getMetaDataMap = (state: TypedState) => state.chat.get('metaData')
const getSelectedInbox = (state: TypedState) => {
  const selected = getSelectedConversation(state)
  return state.chat.get('inbox').find(inbox => inbox.get('conversationIDKey') === selected)
}
const getEditingMessage = (state: TypedState) => state.chat.get('editingMessage')

const getTLF = createSelector([getSelectedInbox, getSelectedConversation], (selectedInbox, selected) => {
  if (selected && isPendingConversationIDKey(selected)) {
    return pendingConversationIDKeyToTlfName(selected) || ''
  } else if (selected !== nothingSelected && selectedInbox) {
    return selectedInbox.participants.join(',')
  }
  return ''
})

const getMuted = createSelector(
  [getSelectedInbox],
  selectedInbox => selectedInbox && selectedInbox.get('status') === 'muted'
)

const getMessageFromMessageKey = (state: TypedState, messageKey: MessageKey): ?Message =>
  state.chat.getIn(['messageMap', messageKey])

const getSelectedConversationStates = (state: TypedState): ?ConversationState => {
  const selectedConversationIDKey = getSelectedConversation(state)
  return state.chat.getIn(['conversationStates', selectedConversationIDKey])
}

const getSupersedes = (state: TypedState): ?SupersedeInfo => {
  const selectedConversationIDKey = getSelectedConversation(state)
  return selectedConversationIDKey ? convSupersedesInfo(selectedConversationIDKey, state.chat) : null
}

const imageFileNameRegex = /[^/]+\.(jpg|png|gif|jpeg|bmp)$/
function isImageFileName(filename: string): boolean {
  return imageFileNameRegex.test(filename)
}

const getInboxSearch = ({chat: {inboxSearch}}: TypedState) => inboxSearch
const getFollowingStates = (state: TypedState) => {
  const ids = getInboxSearch(state)
  let followingStateMap = {}
  ids.forEach(id => {
    const {username, serviceId} = parseUserId(id)
    const service = SearchConstants.serviceIdToService(serviceId)
    followingStateMap[id] = SearchConstants.followStateHelper(state, username, service)
  })
  return followingStateMap
}

const getUserItems = createShallowEqualSelector(
  [getInboxSearch, getFollowingStates],
  (inboxSearch, followingStates) =>
    inboxSearch
      .map(id => {
        const {username, serviceId} = parseUserId(id)
        const service = SearchConstants.serviceIdToService(serviceId)
        return {
          id: id,
          followingState: followingStates[id],
          // $FlowIssue ??
          icon: serviceIdToIcon(serviceId),
          username,
          service,
        }
      })
      .toArray()
)

export {
  getBrokenUsers,
  getEditingMessage,
  getMessageFromMessageKey,
  getSelectedConversation,
  getSelectedConversationStates,
  getSupersedes,
  conversationIDToKey,
  convSupersedesInfo,
  convSupersededByInfo,
  keyToConversationID,
  keyToOutboxID,
  makeSnippet,
  makeTeamTitle,
  messageKey,
  messageKeyKind,
  messageKeyValue,
  messageKeyConversationIDKey,
  splitMessageIDKey,
  outboxIDToKey,
  participantFilter,
  serverMessageToMessageBody,
  usernamesToUserListItem,
  clampAttachmentPreviewSize,
  newestConversationIDKey,
  parseMetadataPreviewSize,
  pendingConversationIDKey,
  isPendingConversationIDKey,
  pendingConversationIDKeyToTlfName,
  getAttachmentInfo,
  getSelectedRouteState,
  getYou,
  getFollowingMap,
  getMetaDataMap,
  getSelectedInbox,
  getTLF,
  getMuted,
  getUserItems,
  LocalMessageState,
  defaultLocalMessageState,
  getLocalMessageStateFromMessageKey,
  isImageFileName,
}
