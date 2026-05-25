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
@Table(name = "account_message")
public class AccountMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private Compte sender;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private Compte recipient;

    @Column(nullable = false, length = 1000)
    private String content;

    @Column(name = "image_data", columnDefinition = "bytea")
    private byte[] imageData;

    @Column(name = "image_content_type", length = 80)
    private String imageContentType;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AccountMessage() {
    }

    public AccountMessage(Compte sender, Compte recipient, String content) {
        this.sender = sender;
        this.recipient = recipient;
        this.content = content;
    }

    public AccountMessage(Compte sender, Compte recipient, String content, byte[] imageData, String imageContentType) {
        this.sender = sender;
        this.recipient = recipient;
        this.content = content;
        this.imageData = imageData;
        this.imageContentType = imageContentType;
    }

    @PrePersist
    public void touch() {
        this.createdAt = Instant.now();
    }

    public Integer getId() {
        return id;
    }

    public Compte getSender() {
        return sender;
    }

    public Compte getRecipient() {
        return recipient;
    }

    public String getContent() {
        return content;
    }

    public byte[] getImageData() {
        return imageData;
    }

    public String getImageContentType() {
        return imageContentType;
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

    public boolean hasImage() {
        return imageData != null && imageData.length > 0;
    }

    public void markRead() {
        if (readAt == null) {
            readAt = Instant.now();
        }
    }
}
