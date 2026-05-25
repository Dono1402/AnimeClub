package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AccountNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface AccountNotificationRepository extends JpaRepository<AccountNotification, Integer> {

    List<AccountNotification> findByRecipient_IdOrderByCreatedAtDesc(Integer recipientId);

    List<AccountNotification> findByRecipient_IdAndReadAtIsNull(Integer recipientId);

    List<AccountNotification> findByRecipient_IdAndTypeAndReadAtIsNull(Integer recipientId, String type);

    boolean existsByRecipient_IdAndActor_IdAndTypeAndReadAtIsNull(Integer recipientId, Integer actorId, String type);

    boolean existsByRecipient_IdAndActor_IdAndTypeAndCreatedAtAfter(Integer recipientId, Integer actorId, String type, Instant createdAt);

    boolean existsByRecipient_IdAndType(Integer recipientId, String type);

    long countByRecipient_IdAndReadAtIsNull(Integer recipientId);

    Optional<AccountNotification> findByIdAndRecipient_Id(Integer id, Integer recipientId);

    void deleteByRecipient_Id(Integer recipientId);
}
