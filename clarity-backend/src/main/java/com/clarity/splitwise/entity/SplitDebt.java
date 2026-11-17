package com.clarity.splitwise.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "split_debts", indexes = {
        @Index(name = "idx_split_debts_inst_updated", columnList = "installation_id, updated_at DESC"),
        @Index(name = "idx_split_debts_person", columnList = "person_id")
})
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class SplitDebt {

    @Id
    @Column(name = "id", nullable = false, length = 255)
    private String id;

    @Column(name = "installation_id", nullable = false, length = 255)
    private String installationId;

    @Column(name = "person_id", nullable = false, length = 255)
    private String personId;

    @Column(name = "friend_email", length = 255)
    private String friendEmail;

    @Column(name = "owner_email", length = 255)
    private String ownerEmail;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "type", nullable = false, length = 50)
    private String type;

    @Column(name = "description", nullable = false, length = 500)
    private String description;

    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private boolean isDeleted = false;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
