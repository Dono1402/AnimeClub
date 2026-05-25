package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AccountMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AccountMessageRepository extends JpaRepository<AccountMessage, Integer> {

    @Query("""
            select message from AccountMessage message
            where (message.sender.id = :accountId and message.recipient.id = :friendId)
               or (message.sender.id = :friendId and message.recipient.id = :accountId)
            order by message.createdAt asc
            """)
    List<AccountMessage> findConversation(
            @Param("accountId") Integer accountId,
            @Param("friendId") Integer friendId
    );

    @Query("""
            select message from AccountMessage message
            where (message.sender.id = :accountId and message.recipient.id = :friendId)
               or (message.sender.id = :friendId and message.recipient.id = :accountId)
            order by message.createdAt desc
            """)
    List<AccountMessage> findLatestConversationMessage(
            @Param("accountId") Integer accountId,
            @Param("friendId") Integer friendId,
            Pageable pageable
    );

    List<AccountMessage> findBySender_IdAndRecipient_IdAndReadAtIsNull(Integer senderId, Integer recipientId);

    long countBySender_IdAndRecipient_IdAndReadAtIsNull(Integer senderId, Integer recipientId);
}
