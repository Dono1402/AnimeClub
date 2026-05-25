package com.example.AnimaClub.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "account_notification")
public class AccountNotification {

    public static final String TYPE_FOLLOW = "FOLLOW";
    public static final String TYPE_ACTIVITY_LIKE = "ACTIVITY_LIKE";
    public static final String TYPE_USERNAME_CHANGE_REQUIRED = "USERNAME_CHANGE_REQUIRED";
    public static final String TYPE_FRIEND_ONLINE = "FRIEND_ONLINE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private Compte recipient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private Compte actor;

    @Column(nullable = false, length = 32)
    private String type;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AccountNotification() {
    }

    public AccountNotification(Compte recipient, Compte actor, String type) {
        this.recipient = recipient;
        this.actor = actor;
        this.type = type;
    }

    @PrePersist
    public void touch() {
        this.createdAt = Instant.now();
    }

    public Integer getId() {
        return id;
    }

    public Compte getRecipient() {
        return recipient;
    }

    public Compte getActor() {
        return actor;
    }

    public String getType() {
        return type;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isRead() {
        return readAt != null;
    }

    public void markRead() {
        if (readAt == null) {
            readAt = Instant.now();
        }
    }
}
