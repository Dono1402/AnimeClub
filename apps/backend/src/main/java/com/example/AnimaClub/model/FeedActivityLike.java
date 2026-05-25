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
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "feed_activity_like",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_feed_activity_like_account_activity",
                columnNames = {"account_id", "activity_type", "activity_entry_id"}
        )
)
public class FeedActivityLike {

    public static final String TYPE_ANIME = "ANIME";
    public static final String TYPE_MANGA = "MANGA";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Compte account;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_owner_id", nullable = false)
    private Compte activityOwner;

    @Column(name = "activity_type", nullable = false, length = 20)
    private String activityType;

    @Column(name = "activity_entry_id", nullable = false)
    private Integer activityEntryId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected FeedActivityLike() {
    }

    public FeedActivityLike(Compte account, Compte activityOwner, String activityType, Integer activityEntryId) {
        this.account = account;
        this.activityOwner = activityOwner;
        this.activityType = activityType;
        this.activityEntryId = activityEntryId;
    }

    @PrePersist
    public void touch() {
        this.createdAt = Instant.now();
    }

    public Integer getId() {
        return id;
    }

    public Compte getAccount() {
        return account;
    }

    public Compte getActivityOwner() {
        return activityOwner;
    }

    public String getActivityType() {
        return activityType;
    }

    public Integer getActivityEntryId() {
        return activityEntryId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
