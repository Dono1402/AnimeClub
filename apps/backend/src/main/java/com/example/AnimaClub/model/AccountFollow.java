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
        name = "account_follow",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_account_follow_pair",
                columnNames = {"follower_id", "followed_id"}
        )
)
public class AccountFollow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "follower_id", nullable = false)
    private Compte follower;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "followed_id", nullable = false)
    private Compte followed;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AccountFollow() {
    }

    public AccountFollow(Compte follower, Compte followed) {
        this.follower = follower;
        this.followed = followed;
    }

    @PrePersist
    public void touch() {
        this.createdAt = Instant.now();
    }

    public Integer getId() {
        return id;
    }

    public Compte getFollower() {
        return follower;
    }

    public Compte getFollowed() {
        return followed;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
