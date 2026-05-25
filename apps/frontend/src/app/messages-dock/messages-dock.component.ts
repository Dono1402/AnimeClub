import { Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import { Account } from '../models/account.model';
import { PublicProfile } from '../models/public-profile.model';
import { AccountMessage, MessageConversation } from '../models/social.model';
import { AuthService } from '../services/auth.service';
import { BrowserTitleBadgeService } from '../services/browser-title-badge.service';
import { PresenceService } from '../services/presence.service';
import { ProfileService } from '../services/profile.service';

const MESSAGE_DOCK_POLL_INTERVAL_MS = 5000;
const MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const TYPING_SIGNAL_INTERVAL_MS = 1500;
const ALLOWED_MESSAGE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Component({
  selector: 'app-messages-dock',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './messages-dock.component.html',
  styleUrl: './messages-dock.component.scss',
})
export class MessagesDockComponent implements OnInit, OnDestroy {
  @ViewChild('dockThread') private dockThread?: ElementRef<HTMLElement>;

  private readonly authService = inject(AuthService);
  private readonly browserTitleBadgeService = inject(BrowserTitleBadgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly presenceService = inject(PresenceService);
  private readonly profileService = inject(ProfileService);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private selectedImageObjectUrl: string | null = null;
  private readonly messageImageObjectUrls = new Map<string, string>();
  private readonly loadingMessageImages = new Set<string>();
  private draftTextarea: HTMLTextAreaElement | null = null;
  private knownConversationMessageIds = new Map<number, number>();
  private conversationListReady = false;
  private summaryRefreshInFlight = false;
  private activeMessagesRefreshInFlight = false;
  private messageAudioContext: AudioContext | null = null;
  private lastTypingSignalAt = 0;
  private nextLocalMessageId = -1;

  readonly account = signal<Account | null>(this.authService.currentAccount());
  readonly dockOpen = signal(false);
  readonly friends = signal<PublicProfile[]>([]);
  readonly conversations = signal<MessageConversation[]>([]);
  readonly messages = signal<AccountMessage[]>([]);
  readonly activeFriendId = signal<number | null>(null);
  readonly draft = signal('');
  readonly loading = signal(false);
  readonly messageLoading = signal(false);
  readonly sending = signal(false);
  readonly feedback = signal('');
  readonly imageViewerUrl = signal<string | null>(null);
  readonly conversationMenuFriendId = signal<number | null>(null);
  readonly newConversationOpen = signal(false);
  readonly selectedImage = signal<File | null>(null);
  readonly selectedImagePreviewUrl = signal<string | null>(null);
  private readonly hiddenConversationMessageIds = signal<Record<number, number>>({});

  readonly activeFriend = computed(() => {
    const activeFriendId = this.activeFriendId();
    if (!activeFriendId) {
      return null;
    }

    return this.friends().find((friend) => friend.id === activeFriendId) ?? null;
  });
  readonly activeFriendTyping = computed(() => {
    const activeFriendId = this.activeFriendId();
    return activeFriendId ? this.friendTyping(activeFriendId) : false;
  });
  readonly orderedFriends = computed(() => {
    const hiddenConversations = this.hiddenConversationMessageIds();
    const conversationsByFriend = new Map(this.conversations().map((conversation) => [conversation.friendId, conversation]));
    return [...this.friends()].filter((friend) => {
      const lastMessageId = conversationsByFriend.get(friend.id)?.lastMessage?.id ?? 0;
      return !this.isConversationHidden(friend.id, lastMessageId, hiddenConversations);
    }).sort((left, right) => {
      const leftConversation = conversationsByFriend.get(left.id);
      const rightConversation = conversationsByFriend.get(right.id);
      const leftTime = this.messageTime(leftConversation?.lastMessage);
      const rightTime = this.messageTime(rightConversation?.lastMessage);

      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return this.displayName(left).localeCompare(this.displayName(right), 'fr', { sensitivity: 'base' });
    });
  });
  readonly visibleConversations = computed(() => {
    const hiddenConversations = this.hiddenConversationMessageIds();
    return this.conversations().filter((conversation) => {
      const lastMessageId = conversation.lastMessage?.id ?? 0;
      return !this.isConversationHidden(conversation.friendId, lastMessageId, hiddenConversations);
    });
  });
  readonly onlineFriends = computed(() =>
    [...this.friends()]
      .filter((friend) => friend.online)
      .sort((left, right) =>
        this.displayName(left).localeCompare(this.displayName(right), 'fr', { sensitivity: 'base' }),
      ),
  );
  readonly newConversationFriends = computed(() =>
    this.friends()
      .filter((friend) => !this.orderedFriends().some((activeFriend) => activeFriend.id === friend.id))
      .sort((left, right) =>
        this.displayName(left).localeCompare(this.displayName(right), 'fr', { sensitivity: 'base' }),
      ),
  );
  readonly totalUnread = computed(() =>
    this.visibleConversations().reduce((total, conversation) => total + Number(conversation.unreadCount || 0), 0),
  );
  readonly canSend = computed(() =>
    Boolean(this.activeFriend() && (this.draft().trim() || this.selectedImage()) && !this.sending()),
  );
  readonly lastOutgoingMessageId = computed(() => {
    const messages = this.messages();
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].own) {
        return messages[index].id;
      }
    }

    return null;
  });

  ngOnInit(): void {
    this.authService.account$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((account) => this.applyAccount(account));
    this.prepareMessageSound();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.setSelectedImage(null);
    this.clearMessageImageObjectUrls();
  }

  @HostListener('document:keydown.escape')
  closeImageViewerOnEscape(): void {
    this.closeImageViewer();
    this.conversationMenuFriendId.set(null);
    this.newConversationOpen.set(false);
  }

  @HostListener('document:click')
  closeConversationMenuFromDocument(): void {
    this.conversationMenuFriendId.set(null);
    this.newConversationOpen.set(false);
  }

  toggleDock(): void {
    this.dockOpen.update((open) => !open);
    if (this.dockOpen()) {
      this.loadSummary(true);
      this.loadMessagesForActiveFriend(false);
    } else {
      this.newConversationOpen.set(false);
    }
  }

  closeDock(): void {
    this.dockOpen.set(false);
    this.newConversationOpen.set(false);
  }

  backToList(): void {
    this.activeFriendId.set(null);
    this.clearMessageImageObjectUrls();
    this.messages.set([]);
    this.setSelectedImage(null);
    this.feedback.set('');
    this.lastTypingSignalAt = 0;
    this.newConversationOpen.set(false);
  }

  selectFriend(friend: PublicProfile): void {
    this.activeFriendId.set(friend.id);
    this.draft.set('');
    this.resetDraftTextarea();
    this.setSelectedImage(null);
    this.clearMessageImageObjectUrls();
    this.feedback.set('');
    this.lastTypingSignalAt = 0;
    this.newConversationOpen.set(false);
    this.loadMessagesForActiveFriend(true);
  }

  setDraft(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.draftTextarea = textarea;
    const value = textarea.value.slice(0, 1000);
    if (textarea.value !== value) {
      textarea.value = value;
    }
    this.draft.set(value);
    this.resizeDraftTextarea(textarea);
    this.reportTyping();
  }

  sendWithEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendMessage();
  }

  sendMessage(): void {
    const account = this.account();
    const friend = this.activeFriend();
    const content = this.draft().trim();
    const image = this.selectedImage();
    if (!account || !friend || (!content && !image) || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.feedback.set('');

    const request = image
      ? this.profileService.sendMessageWithImage(account.id, friend.id, content, image)
      : this.profileService.sendMessage(account.id, friend.id, { content });
    const localMessage = this.createLocalMessage(account, friend, content);

    this.messages.update((messages) => [...messages, localMessage]);
    this.scrollConversationToBottom(true);

    request.subscribe({
      next: (message) => {
        this.replaceLocalMessage(localMessage.id, message);
        this.draft.set('');
        this.resetDraftTextarea();
        this.setSelectedImage(null);
        this.sending.set(false);
        this.lastTypingSignalAt = 0;
        this.scrollConversationToBottom(true);
        this.refreshConversations();
      },
      error: () => {
        this.removeLocalMessage(localMessage.id);
        this.feedback.set('Message impossible. Vous devez vous suivre mutuellement.');
        this.sending.set(false);
      },
    });
  }

  selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }

    if (!ALLOWED_MESSAGE_IMAGE_TYPES.has(file.type)) {
      this.feedback.set('Image refusee : JPG, PNG, WebP ou GIF uniquement.');
      return;
    }

    if (file.size > MESSAGE_IMAGE_MAX_BYTES) {
      this.feedback.set("L'image ne doit pas depasser 10 Mo.");
      return;
    }

    this.feedback.set('');
    this.setSelectedImage(file);
  }

  clearSelectedImage(): void {
    this.setSelectedImage(null);
  }

  profilePicture(profile: PublicProfile): string | null {
    return this.profileService.assetUrl(profile.profilePictureUrl);
  }

  displayName(profile: PublicProfile): string {
    return profile.displayName || profile.pseudo;
  }

  initials(profile: PublicProfile): string {
    return this.displayName(profile).slice(0, 1).toUpperCase() || 'A';
  }

  unreadCount(friendId: number): number {
    return this.visibleConversations().find((conversation) => conversation.friendId === friendId)?.unreadCount ?? 0;
  }

  lastMessageLabel(friendId: number): string {
    if (this.friendTyping(friendId)) {
      return 'Ecrit...';
    }

    const lastMessage = this.visibleConversations().find((conversation) => conversation.friendId === friendId)?.lastMessage;
    if (!lastMessage) {
      return 'Aucun message';
    }

    const prefix = lastMessage.own ? 'Toi : ' : '';
    return `${prefix}${lastMessage.content || (lastMessage.imageUrl ? 'Image' : '')}`;
  }

  conversationTimeLabel(friendId: number): string {
    const lastMessage = this.visibleConversations().find((conversation) => conversation.friendId === friendId)?.lastMessage;
    return this.messageTimeLabel(lastMessage);
  }

  friendTyping(friendId: number): boolean {
    return Boolean(this.visibleConversations().find((conversation) => conversation.friendId === friendId)?.friendTyping);
  }

  messageTimeLabel(message: AccountMessage | null | undefined): string {
    if (!message?.createdAt) {
      return '';
    }

    const createdAt = new Date(message.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('fr-BE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(createdAt);
  }

  messageImageUrl(message: AccountMessage): string | null {
    const imageUrl = message.imageUrl;
    if (!imageUrl) {
      return null;
    }

    if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    const cachedUrl = this.messageImageObjectUrls.get(imageUrl);
    if (cachedUrl) {
      return cachedUrl;
    }

    this.loadMessageImage(imageUrl);
    return null;
  }

  isImageOnlyMessage(message: AccountMessage): boolean {
    return Boolean(this.messageImageUrl(message) && !message.content);
  }

  messageDeliveryStatus(message: AccountMessage): 'sent' | 'delivered' | 'read' {
    if (message.read) {
      return 'read';
    }

    return this.isLocalMessage(message) ? 'sent' : 'delivered';
  }

  shouldShowMessageDelivery(message: AccountMessage): boolean {
    return message.own && message.id === this.lastOutgoingMessageId();
  }

  messageDeliveryLabel(message: AccountMessage): string {
    const status = this.messageDeliveryStatus(message);
    if (status === 'read') {
      return 'Lu';
    }

    return status === 'delivered' ? 'Bien recu' : 'Envoye';
  }

  openImageViewer(imageUrl: string): void {
    this.imageViewerUrl.set(imageUrl);
  }

  closeImageViewer(): void {
    this.imageViewerUrl.set(null);
  }

  unreadLabel(): string {
    const unread = this.totalUnread();
    return unread > 9 ? '9+' : String(unread);
  }

  fullMessagesQueryParams(): Record<string, number> | null {
    const activeFriendId = this.activeFriendId();
    return activeFriendId ? { friend: activeFriendId } : null;
  }

  toggleConversationMenu(friendId: number, event: Event): void {
    event.stopPropagation();
    this.newConversationOpen.set(false);
    this.conversationMenuFriendId.update((activeFriendId) => activeFriendId === friendId ? null : friendId);
  }

  toggleNewConversation(event: Event): void {
    event.stopPropagation();
    this.conversationMenuFriendId.set(null);
    this.newConversationOpen.update((open) => !open);
  }

  startConversation(friend: PublicProfile, event: Event): void {
    event.stopPropagation();
    this.restoreHiddenConversation(friend.id);
    this.selectFriend(friend);
  }

  hideConversation(friend: PublicProfile, event: Event): void {
    event.stopPropagation();
    const account = this.account();
    if (!account) {
      return;
    }

    const lastMessageId = this.conversations().find((conversation) => conversation.friendId === friend.id)?.lastMessage?.id ?? 0;
    const hiddenConversations = {
      ...this.hiddenConversationMessageIds(),
      [friend.id]: lastMessageId,
    };

    this.hiddenConversationMessageIds.set(hiddenConversations);
    this.saveHiddenConversations(account.id, hiddenConversations);
    this.updateUnreadMessageBadge();
    this.conversationMenuFriendId.set(null);

    if (this.activeFriendId() === friend.id) {
      this.backToList();
    }
  }

  private applyAccount(account: Account | null): void {
    const previousAccountId = this.account()?.id ?? null;
    const nextAccountId = account?.id ?? null;
    this.account.set(account);

    if (previousAccountId !== nextAccountId) {
      this.resetState();
    }

    if (!account) {
      this.stopPolling();
      return;
    }

    this.loadHiddenConversations(account.id);
    this.loadSummary(false);
    this.startPolling();
  }

  private loadSummary(showLoader: boolean): void {
    const account = this.account();
    if (!account) {
      this.resetState();
      return;
    }

    if (this.summaryRefreshInFlight) {
      return;
    }

    if (showLoader) {
      this.loading.set(true);
    }

    this.summaryRefreshInFlight = true;
    forkJoin({
      friends: this.profileService.friends(account.id).pipe(catchError(() => of(this.friends()))),
      conversations: this.profileService.messageConversations(account.id).pipe(catchError(() => of(this.conversations()))),
    }).pipe(
      finalize(() => {
        this.summaryRefreshInFlight = false;
        if (showLoader) {
          this.loading.set(false);
        }
      }),
    ).subscribe(({ friends, conversations }) => {
      this.friends.set(friends);
      this.presenceService.syncFriendsPresence(friends, true);
      this.applyConversations(conversations);
      this.ensureActiveFriendStillExists();
    });
  }

  private loadMessagesForActiveFriend(showLoader: boolean): void {
    const account = this.account();
    const activeFriendId = this.activeFriendId();
    if (!this.dockOpen() || !account || !activeFriendId || !this.friends().some((friend) => friend.id === activeFriendId)) {
      if (!activeFriendId) {
        this.clearMessageImageObjectUrls();
        this.messages.set([]);
      }
      return;
    }

    if (!showLoader && this.activeMessagesRefreshInFlight) {
      return;
    }

    if (showLoader) {
      this.messageLoading.set(true);
    }

    const shouldStickToBottom = showLoader || this.isConversationNearBottom();
    this.activeMessagesRefreshInFlight = true;
    this.profileService.messages(account.id, activeFriendId).pipe(
      finalize(() => {
        this.activeMessagesRefreshInFlight = false;
        this.messageLoading.set(false);
      }),
    ).subscribe({
      next: (messages) => {
        this.setMessagesWithLocalPending(messages);
        this.scrollConversationToBottom(shouldStickToBottom);
        this.refreshConversations();
      },
      error: () => {
        this.messages.set([]);
        this.feedback.set('Conversation inaccessible.');
      },
    });
  }

  private refreshConversations(): void {
    const account = this.account();
    if (!account) {
      return;
    }

    this.profileService.messageConversations(account.id).subscribe({
      next: (conversations) => this.applyConversations(conversations),
      error: () => undefined,
    });
  }

  private refreshSilently(): void {
    if (!this.account() || this.loading()) {
      return;
    }

    this.loadSummary(false);
    this.loadMessagesForActiveFriend(false);
  }

  private reportTyping(): void {
    const account = this.account();
    const friend = this.activeFriend();
    if (!account || !friend || !this.draft().trim()) {
      return;
    }

    const now = Date.now();
    if (now - this.lastTypingSignalAt < TYPING_SIGNAL_INTERVAL_MS) {
      return;
    }

    this.lastTypingSignalAt = now;
    this.profileService.markTyping(account.id, friend.id).subscribe({
      error: () => undefined,
    });
  }

  private ensureActiveFriendStillExists(): void {
    const activeFriendId = this.activeFriendId();
    if (activeFriendId && !this.friends().some((friend) => friend.id === activeFriendId)) {
      this.backToList();
    }
  }

  private startPolling(): void {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => this.refreshSilently(), MESSAGE_DOCK_POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (!this.refreshTimer) {
      return;
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private resetState(): void {
    this.dockOpen.set(false);
    this.friends.set([]);
    this.conversations.set([]);
    this.browserTitleBadgeService.setUnreadMessages(0);
    this.hiddenConversationMessageIds.set({});
    this.conversationMenuFriendId.set(null);
    this.newConversationOpen.set(false);
    this.clearMessageImageObjectUrls();
    this.messages.set([]);
    this.activeFriendId.set(null);
    this.draft.set('');
    this.loading.set(false);
    this.messageLoading.set(false);
    this.sending.set(false);
    this.setSelectedImage(null);
    this.feedback.set('');
    this.knownConversationMessageIds.clear();
    this.conversationListReady = false;
    this.nextLocalMessageId = -1;
  }

  private messageTime(message: AccountMessage | null | undefined): number {
    return message?.createdAt ? new Date(message.createdAt).getTime() : 0;
  }

  private createLocalMessage(account: Account, friend: PublicProfile, content: string): AccountMessage {
    return {
      id: this.nextLocalMessageId--,
      sender: this.accountAsPublicProfile(account),
      recipient: friend,
      own: true,
      content,
      imageUrl: this.selectedImagePreviewUrl(),
      read: false,
      createdAt: new Date().toISOString(),
    };
  }

  private accountAsPublicProfile(account: Account): PublicProfile {
    return {
      id: account.id,
      pseudo: account.pseudo,
      displayName: account.displayName || account.pseudo,
      bio: account.bio,
      profileStatus: account.profileStatus,
      favoriteAnime: account.favoriteAnime,
      accentColor: account.accentColor,
      profilePictureUrl: account.profilePictureUrl,
      backgroundUrl: account.backgroundUrl,
      online: true,
      lastActiveAt: null,
      showFollowers: account.showFollowers,
      showFollowing: account.showFollowing,
      followersCount: 0,
      followingCount: 0,
      showAnimeLibrary: account.showAnimeLibrary,
      showMangaLibrary: account.showMangaLibrary,
    };
  }

  private replaceLocalMessage(localMessageId: number, deliveredMessage: AccountMessage): void {
    this.messages.update((messages) => {
      if (messages.some((message) => message.id === deliveredMessage.id)) {
        return messages.filter((message) => message.id !== localMessageId);
      }

      const localMessageIndex = messages.findIndex((message) => message.id === localMessageId);
      if (localMessageIndex === -1) {
        return this.messageBelongsToActiveFriend(deliveredMessage) ? [...messages, deliveredMessage] : messages;
      }

      return messages.map((message) => message.id === localMessageId ? deliveredMessage : message);
    });
  }

  private removeLocalMessage(localMessageId: number): void {
    this.messages.update((messages) => messages.filter((message) => message.id !== localMessageId));
  }

  private setMessagesWithLocalPending(messages: AccountMessage[]): void {
    const localMessages = this.messages().filter((message) =>
      this.isLocalMessage(message) && this.messageBelongsToActiveFriend(message),
    );
    this.messages.set([...messages, ...localMessages]);
  }

  private loadMessageImage(imageUrl: string): void {
    if (this.loadingMessageImages.has(imageUrl)) {
      return;
    }

    this.loadingMessageImages.add(imageUrl);
    this.profileService.messageImage(imageUrl).subscribe({
      next: (blob) => {
        const previousObjectUrl = this.messageImageObjectUrls.get(imageUrl);
        if (previousObjectUrl) {
          URL.revokeObjectURL(previousObjectUrl);
        }

        this.messageImageObjectUrls.set(imageUrl, URL.createObjectURL(blob));
        this.loadingMessageImages.delete(imageUrl);
        this.messages.update((messages) => [...messages]);
      },
      error: () => {
        this.loadingMessageImages.delete(imageUrl);
      },
    });
  }

  private clearMessageImageObjectUrls(): void {
    this.messageImageObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    this.messageImageObjectUrls.clear();
    this.loadingMessageImages.clear();
  }

  private isLocalMessage(message: AccountMessage): boolean {
    return message.id < 0;
  }

  private messageBelongsToActiveFriend(message: AccountMessage): boolean {
    const activeFriendId = this.activeFriendId();
    return Boolean(activeFriendId && (message.sender.id === activeFriendId || message.recipient.id === activeFriendId));
  }

  private applyConversations(conversations: MessageConversation[]): void {
    this.restoreConversationsWithNewMessages(conversations);

    const hasNewIncomingMessage = this.conversationListReady && conversations.some((conversation) => {
      const lastMessage = conversation.lastMessage;
      return Boolean(
        lastMessage
        && !lastMessage.own
        && this.knownConversationMessageIds.get(conversation.friendId) !== lastMessage.id,
      );
    });

    this.conversations.set(conversations);
    this.updateUnreadMessageBadge();
    this.knownConversationMessageIds = new Map(
      conversations
        .filter((conversation) => conversation.lastMessage)
        .map((conversation) => [conversation.friendId, conversation.lastMessage?.id ?? 0]),
    );

    if (!this.conversationListReady) {
      this.conversationListReady = true;
      return;
    }

    if (hasNewIncomingMessage) {
      this.playMessageSound();
    }
  }

  private isConversationHidden(
    friendId: number,
    lastMessageId: number,
    hiddenConversations = this.hiddenConversationMessageIds(),
  ): boolean {
    return hiddenConversations[friendId] === lastMessageId;
  }

  private loadHiddenConversations(accountId: number): void {
    try {
      const rawHiddenConversations = localStorage.getItem(this.hiddenConversationsStorageKey(accountId));
      if (!rawHiddenConversations) {
        this.hiddenConversationMessageIds.set({});
        return;
      }

      const parsed = JSON.parse(rawHiddenConversations) as Record<string, unknown>;
      const hiddenConversations = Object.fromEntries(
        Object.entries(parsed)
          .map(([friendId, messageId]) => [Number(friendId), Number(messageId)])
          .filter(([friendId, messageId]) => Number.isInteger(friendId) && Number.isInteger(messageId)),
      );
      this.hiddenConversationMessageIds.set(hiddenConversations);
    } catch {
      this.hiddenConversationMessageIds.set({});
    }
  }

  private saveHiddenConversations(accountId: number, hiddenConversations: Record<number, number>): void {
    try {
      localStorage.setItem(this.hiddenConversationsStorageKey(accountId), JSON.stringify(hiddenConversations));
    } catch {
      // Le masquage local du chat reste non bloquant si le stockage navigateur est indisponible.
    }
  }

  private restoreHiddenConversation(friendId: number): void {
    const account = this.account();
    const hiddenConversations = this.hiddenConversationMessageIds();
    if (!account || hiddenConversations[friendId] === undefined) {
      return;
    }

    const restoredHiddenConversations = { ...hiddenConversations };
    delete restoredHiddenConversations[friendId];
    this.hiddenConversationMessageIds.set(restoredHiddenConversations);
    this.saveHiddenConversations(account.id, restoredHiddenConversations);
    this.updateUnreadMessageBadge();
  }

  private restoreConversationsWithNewMessages(conversations: MessageConversation[]): void {
    const account = this.account();
    if (!account) {
      return;
    }

    const hiddenConversations = this.hiddenConversationMessageIds();
    const restoredHiddenConversations = { ...hiddenConversations };
    let changed = false;

    for (const conversation of conversations) {
      const hiddenLastMessageId = hiddenConversations[conversation.friendId];
      if (hiddenLastMessageId === undefined) {
        continue;
      }

      const currentLastMessageId = conversation.lastMessage?.id ?? 0;
      if (currentLastMessageId !== hiddenLastMessageId) {
        delete restoredHiddenConversations[conversation.friendId];
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    this.hiddenConversationMessageIds.set(restoredHiddenConversations);
    this.saveHiddenConversations(account.id, restoredHiddenConversations);
  }

  private updateUnreadMessageBadge(): void {
    this.browserTitleBadgeService.setUnreadMessages(
      this.visibleConversations().reduce((total, conversation) => total + Number(conversation.unreadCount || 0), 0),
    );
  }

  private hiddenConversationsStorageKey(accountId: number): string {
    return `animaclub.hidden-dock-conversations.${accountId}`;
  }

  private setSelectedImage(file: File | null): void {
    if (this.selectedImageObjectUrl) {
      URL.revokeObjectURL(this.selectedImageObjectUrl);
      this.selectedImageObjectUrl = null;
    }

    this.selectedImage.set(file);
    if (!file) {
      this.selectedImagePreviewUrl.set(null);
      return;
    }

    this.selectedImageObjectUrl = URL.createObjectURL(file);
    this.selectedImagePreviewUrl.set(this.selectedImageObjectUrl);
  }

  private resizeDraftTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  private resetDraftTextarea(): void {
    const textarea = this.draftTextarea;
    if (!textarea) {
      return;
    }

    window.requestAnimationFrame(() => {
      textarea.value = this.draft();
      textarea.style.height = '';
      this.resizeDraftTextarea(textarea);
    });
  }

  private prepareMessageSound(): void {
    const unlockSound = () => {
      const context = this.ensureMessageAudioContext();
      if (!context) {
        return;
      }

      void context.resume().catch(() => undefined);
    };

    window.addEventListener('pointerdown', unlockSound, { once: true, passive: true });
    window.addEventListener('keydown', unlockSound, { once: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
    });
  }

  private playMessageSound(): void {
    const context = this.ensureMessageAudioContext();
    if (!context) {
      return;
    }

    const play = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(520, now);
      oscillator.frequency.setValueAtTime(780, now + 0.12);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.065, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.28);
    };

    if (context.state === 'suspended') {
      void context.resume().then(play).catch(() => undefined);
      return;
    }

    play();
  }

  private ensureMessageAudioContext(): AudioContext | null {
    if (this.messageAudioContext) {
      return this.messageAudioContext;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    this.messageAudioContext = new AudioContextConstructor();
    return this.messageAudioContext;
  }

  private isConversationNearBottom(): boolean {
    const element = this.dockThread?.nativeElement;
    if (!element) {
      return true;
    }

    return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  private scrollConversationToBottom(enabled: boolean): void {
    if (!enabled) {
      return;
    }

    window.setTimeout(() => {
      const element = this.dockThread?.nativeElement;
      if (!element) {
        return;
      }

      element.scrollTop = element.scrollHeight;
    });
  }
}
