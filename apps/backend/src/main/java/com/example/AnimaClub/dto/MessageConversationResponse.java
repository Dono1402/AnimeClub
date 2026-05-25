package com.example.AnimaClub.dto;

public record MessageConversationResponse(
        Integer friendId,
        PublicProfileResponse friend,
        AccountMessageResponse lastMessage,
        Long unreadCount,
        Boolean friendTyping
) {
}
