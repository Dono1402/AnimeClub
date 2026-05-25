import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { Account } from '../models/account.model';
import { PublicProfile } from '../models/public-profile.model';
import { AccountMessage, MessageConversation } from '../models/social.model';
import { AuthService } from '../services/auth.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { ProfileService } from '../services/profile.service';

const MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MESSAGE_POLL_INTERVAL_MS = 3000;
const TYPING_SIGNAL_INTERVAL_MS = 1500;
const ALLOWED_MESSAGE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EMOJI_OPTIONS = ['😀', '😂', '😊', '🔥', '⭐', '❤️', '👍', '🙏'];

type ContactFilter = 'all' | 'unread' | 'online';

interface MessageDayGroup {
  id: string;
  label: string;
  messages: AccountMessage[];
}

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
})
export class MessagesComponent implements OnInit, OnDestroy {
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;

  private readonly authService = inject(AuthService);
  private readonly analytics = inject(MarketingAnalyticsService);
  private readonly profileService = inject(ProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private selectedImageObjectUrl: string | null = null;
  private readonly messageImageObjectUrls = new Map<string, string>();
  private readonly loadingMessageImages = new Set<string>();
  private draftTextarea: HTMLTextAreaElement | null = null;
  private summaryRefreshInFlight = false;
  private activeMessagesRefreshInFlight = false;
  private lastTypingSignalAt = 0;
  private nextLocalMessageId = -1;

  readonly account = this.authService.currentAccount();
  readonly friends = signal<PublicProfile[]>([]);
  readonly conversations = signal<MessageConversation[]>([]);
  readonly messages = signal<AccountMessage[]>([]);
  readonly activeFriendId = signal<number | null>(null);
  readonly draft = signal('');
  readonly loading = signal(true);
  readonly messageLoading = signal(false);
  readonly sending = signal(false);
  readonly feedback = signal('');
  readonly imageViewerUrl = signal<string | null>(null);
  readonly selectedImage = signal<File | null>(null);
  readonly selectedImagePreviewUrl = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly contactFilter = signal<ContactFilter>('all');
  readonly messageSearchOpen = signal(false);
  readonly messageSearchQuery = signal('');
  readonly conversationMenuOpen = signal(false);
  readonly emojiPickerOpen = signal(false);
  readonly emojiOptions = EMOJI_OPTIONS;
  private readonly hiddenConversationMessageIds = signal<Record<number, number>>({});

  readonly activeFriend = computed(() => {
    const activeFriendId = this.activeFriendId();
    if (!activeFriendId) {
      return null;
    }

    return this.friends().find((friend) => friend.id === activeFriendId) ?? null;
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
  readonly filteredFriends = computed(() => {
    const query = this.normalizeSearch(this.searchQuery());
    const filter = this.contactFilter();
    return this.orderedFriends().filter((friend) => {
      if (filter === 'unread' && this.unreadCount(friend.id) <= 0) {
        return false;
      }

      if (filter === 'online' && !friend.online) {
        return false;
      }

      if (!query) {
        return true;
      }

      return this.contactSearchText(friend).includes(query);
    });
  });
  readonly visibleConversations = computed(() => {
    const hiddenConversations = this.hiddenConversationMessageIds();
    return this.conversations().filter((conversation) => {
      const lastMessageId = conversation.lastMessage?.id ?? 0;
      return !this.isConversationHidden(conversation.friendId, lastMessageId, hiddenConversations);
    });
  });
  readonly activeConversation = computed(() =>
    this.conversations().find((conversation) => conversation.friendId === this.activeFriendId()) ?? null,
  );
  readonly activeFriendTyping = computed(() => this.activeConversation()?.friendTyping ?? false);
  readonly canSend = computed(() =>
    Boolean(this.activeFriend() && (this.draft().trim() || this.selectedImage()) && !this.sending()),
  );
  readonly totalUnread = computed(() =>
    this.visibleConversations().reduce((total, conversation) => total + Number(conversation.unreadCount || 0), 0),
  );
  readonly messageGroups = computed<MessageDayGroup[]>(() => {
    const query = this.normalizeSearch(this.messageSearchQuery());
    const groups = new Map<string, MessageDayGroup>();
    const sourceMessages = query
      ? this.messages().filter((message) => this.messageSearchText(message).includes(query))
      : this.messages();

    for (const message of sourceMessages) {
      const createdAt = message.createdAt ? new Date(message.createdAt) : null;
      const id = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString().slice(0, 10) : 'unknown';
      const existing = groups.get(id);
      if (existing) {
        existing.messages.push(message);
        continue;
      }

      groups.set(id, {
        id,
        label: createdAt && !Number.isNaN(createdAt.getTime()) ? this.messageDateLabel(createdAt) : 'Date inconnue',
        messages: [message],
      });
    }

    return Array.from(groups.values());
  });
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
    if (this.account) {
      this.loadHiddenConversations(this.account.id);
    }

    this.route.queryParamMap.subscribe((params) => {
      const friendId = Number(params.get('friend'));
      const selectedFriendId = Number.isFinite(friendId) && friendId > 0 ? friendId : null;
      if (selectedFriendId) {
        this.restoreHiddenConversation(selectedFriendId);
      }

      this.activeFriendId.set(selectedFriendId);
      this.loadMessagesForActiveFriend(false);
    });

    this.load();
    this.refreshTimer = setInterval(() => this.refreshSilently(), MESSAGE_POLL_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.setSelectedImage(null);
    this.clearMessageImageObjectUrls();
  }

  @HostListener('document:keydown.escape')
  closeImageViewerOnEscape(): void {
    this.closeImageViewer();
    this.conversationMenuOpen.set(false);
    this.emojiPickerOpen.set(false);
    this.messageSearchOpen.set(false);
  }

  @HostListener('document:click')
  closeFloatingMenus(): void {
    this.conversationMenuOpen.set(false);
    this.emojiPickerOpen.set(false);
  }

  load(): void {
    if (!this.account) {
      this.loading.set(false);
      this.feedback.set('Connecte-toi pour ouvrir la messagerie.');
      return;
    }

    this.loading.set(true);
    this.feedback.set('');

    forkJoin({
      friends: this.profileService.friends(this.account.id).pipe(catchError(() => of([]))),
      conversations: this.profileService.messageConversations(this.account.id).pipe(catchError(() => of([]))),
    }).subscribe(({ friends, conversations }) => {
      this.friends.set(friends);
      this.applyConversations(conversations);
      this.loading.set(false);
      this.ensureActiveFriend();
      this.loadMessagesForActiveFriend(false);
    });
  }

  selectFriend(friend: PublicProfile): void {
    this.restoreHiddenConversation(friend.id);
    this.activeFriendId.set(friend.id);
    this.draft.set('');
    this.resetDraftTextarea();
    this.setSelectedImage(null);
    this.clearMessageImageObjectUrls();
    this.feedback.set('');
    this.conversationMenuOpen.set(false);
    this.emojiPickerOpen.set(false);
    this.messageSearchQuery.set('');
    this.lastTypingSignalAt = 0;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { friend: friend.id },
      queryParamsHandling: 'merge',
    });
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

  setSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  setMessageSearchQuery(event: Event): void {
    this.messageSearchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleContactFilter(event?: Event): void {
    event?.stopPropagation();
    const nextFilter: Record<ContactFilter, ContactFilter> = {
      all: 'unread',
      unread: 'online',
      online: 'all',
    };
    this.contactFilter.set(nextFilter[this.contactFilter()]);
  }

  contactFilterLabel(): string {
    switch (this.contactFilter()) {
      case 'unread':
        return 'Non lus';
      case 'online':
        return 'En ligne';
      default:
        return 'Tous';
    }
  }

  toggleMessageSearch(event: Event): void {
    event.stopPropagation();
    this.conversationMenuOpen.set(false);
    this.messageSearchOpen.update((open) => !open);
    if (!this.messageSearchOpen()) {
      this.messageSearchQuery.set('');
    }
  }

  toggleConversationMenu(event: Event): void {
    event.stopPropagation();
    this.messageSearchOpen.set(false);
    this.emojiPickerOpen.set(false);
    this.conversationMenuOpen.update((open) => !open);
  }

  toggleEmojiPicker(event: Event): void {
    event.stopPropagation();
    this.conversationMenuOpen.set(false);
    this.emojiPickerOpen.update((open) => !open);
  }

  insertEmoji(emoji: string, event: Event): void {
    event.stopPropagation();
    const value = `${this.draft()}${emoji}`.slice(0, 1000);
    this.draft.set(value);
    this.emojiPickerOpen.set(false);
    this.resetDraftTextarea();
    this.reportTyping();
  }

  sendMessage(): void {
    const account = this.account;
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
        this.analytics.trackEvent('message_sent', {
          route: '/messages',
          recipient_id: friend.id,
          has_image: Boolean(image),
        });
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

  sendWithEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendMessage();
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
    return this.conversations().find((conversation) => conversation.friendId === friendId)?.unreadCount ?? 0;
  }

  lastMessageLabel(friendId: number): string {
    if (this.friendTyping(friendId)) {
      return 'Ecrit...';
    }

    const lastMessage = this.conversations().find((conversation) => conversation.friendId === friendId)?.lastMessage;
    if (!lastMessage) {
      return 'Aucun message pour le moment.';
    }

    const prefix = lastMessage.own ? 'Toi : ' : '';
    return `${prefix}${lastMessage.content || (lastMessage.imageUrl ? 'Image' : '')}`;
  }

  conversationTimeLabel(friendId: number): string {
    const lastMessage = this.conversations().find((conversation) => conversation.friendId === friendId)?.lastMessage;
    return this.messageTimeLabel(lastMessage);
  }

  friendTyping(friendId: number): boolean {
    return Boolean(this.conversations().find((conversation) => conversation.friendId === friendId)?.friendTyping);
  }

  profileStatusLabel(profile: PublicProfile): string {
    if (profile.online) {
      return 'En ligne';
    }

    if (!profile.lastActiveAt) {
      return 'Hors ligne';
    }

    const lastActiveAt = new Date(profile.lastActiveAt);
    if (Number.isNaN(lastActiveAt.getTime())) {
      return 'Hors ligne';
    }

    const diffMs = Date.now() - lastActiveAt.getTime();
    if (diffMs < 60_000) {
      return 'Vu à l’instant';
    }

    if (diffMs < 3_600_000) {
      return `Vu il y a ${Math.max(1, Math.floor(diffMs / 60_000))} min`;
    }

    if (diffMs < 86_400_000) {
      return `Vu il y a ${Math.max(1, Math.floor(diffMs / 3_600_000))} h`;
    }

    return `Vu le ${new Intl.DateTimeFormat('fr-BE', { day: '2-digit', month: '2-digit' }).format(lastActiveAt)}`;
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

  openImageViewer(imageUrl: string): void {
    this.imageViewerUrl.set(imageUrl);
  }

  closeImageViewer(): void {
    this.imageViewerUrl.set(null);
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

  hideActiveConversation(event?: Event): void {
    event?.stopPropagation();
    const account = this.account;
    const friend = this.activeFriend();
    if (!account || !friend) {
      return;
    }

    const lastMessageId = this.conversations().find((conversation) => conversation.friendId === friend.id)?.lastMessage?.id ?? 0;
    const hiddenConversations = {
      ...this.hiddenConversationMessageIds(),
      [friend.id]: lastMessageId,
    };
    this.hiddenConversationMessageIds.set(hiddenConversations);
    this.saveHiddenConversations(account.id, hiddenConversations);
    this.conversationMenuOpen.set(false);
    this.activeFriendId.set(null);
    this.messages.set([]);
    this.setSelectedImage(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { friend: null },
      queryParamsHandling: 'merge',
    });
  }

  private ensureActiveFriend(): void {
    const activeFriendId = this.activeFriendId();
    const friends = this.orderedFriends();
    if (activeFriendId && this.friends().some((friend) => friend.id === activeFriendId)) {
      return;
    }

    this.activeFriendId.set(friends[0]?.id ?? null);
  }

  private loadMessagesForActiveFriend(showLoader: boolean): void {
    const account = this.account;
    const friendId = this.activeFriendId();
    if (!account || !friendId || !this.friends().some((friend) => friend.id === friendId)) {
      this.clearMessageImageObjectUrls();
      this.messages.set([]);
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
    this.profileService.messages(account.id, friendId).pipe(
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
        this.feedback.set('Conversation inaccessible. Vous devez vous suivre mutuellement.');
      },
    });
  }

  private refreshConversations(): void {
    if (!this.account) {
      return;
    }

    this.profileService.messageConversations(this.account.id).subscribe({
      next: (conversations) => this.applyConversations(conversations),
      error: () => undefined,
    });
  }

  private refreshSilently(): void {
    if (!this.account || this.loading() || this.summaryRefreshInFlight) {
      return;
    }

    this.summaryRefreshInFlight = true;
    forkJoin({
      friends: this.profileService.friends(this.account.id).pipe(catchError(() => of(this.friends()))),
      conversations: this.profileService.messageConversations(this.account.id).pipe(catchError(() => of(this.conversations()))),
    }).pipe(
      finalize(() => {
        this.summaryRefreshInFlight = false;
      }),
    ).subscribe(({ friends, conversations }) => {
      this.friends.set(friends);
      this.applyConversations(conversations);
      this.ensureActiveFriend();
      this.loadMessagesForActiveFriend(false);
    });
  }

  private reportTyping(): void {
    const account = this.account;
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

  private messageTime(message: AccountMessage | null | undefined): number {
    return message?.createdAt ? new Date(message.createdAt).getTime() : 0;
  }

  private applyConversations(conversations: MessageConversation[]): void {
    this.restoreConversationsWithNewMessages(conversations);
    this.conversations.set(conversations);
  }

  private messageDateLabel(date: Date): string {
    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private contactSearchText(friend: PublicProfile): string {
    return this.normalizeSearch(`${this.displayName(friend)} ${friend.pseudo} ${this.lastMessageLabel(friend.id)}`);
  }

  private messageSearchText(message: AccountMessage): string {
    return this.normalizeSearch(
      `${message.content ?? ''} ${this.displayName(message.sender)} ${this.displayName(message.recipient)}`,
    );
  }

  private normalizeSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
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
      // Le masquage local reste optionnel si le stockage navigateur est indisponible.
    }
  }

  private restoreHiddenConversation(friendId: number): void {
    if (!this.account) {
      return;
    }

    const hiddenConversations = this.hiddenConversationMessageIds();
    if (hiddenConversations[friendId] === undefined) {
      return;
    }

    const restoredHiddenConversations = { ...hiddenConversations };
    delete restoredHiddenConversations[friendId];
    this.hiddenConversationMessageIds.set(restoredHiddenConversations);
    this.saveHiddenConversations(this.account.id, restoredHiddenConversations);
  }

  private restoreConversationsWithNewMessages(conversations: MessageConversation[]): void {
    if (!this.account) {
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
    this.saveHiddenConversations(this.account.id, restoredHiddenConversations);
  }

  private hiddenConversationsStorageKey(accountId: number): string {
    return `animaclub.hidden-page-conversations.${accountId}`;
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

  private isConversationNearBottom(): boolean {
    const element = this.messageList?.nativeElement;
    if (!element) {
      return true;
    }

    return element.scrollHeight - element.scrollTop - element.clientHeight < 90;
  }

  private scrollConversationToBottom(enabled: boolean): void {
    if (!enabled) {
      return;
    }

    window.setTimeout(() => {
      const element = this.messageList?.nativeElement;
      if (!element) {
        return;
      }

      element.scrollTop = element.scrollHeight;
    });
  }
}
