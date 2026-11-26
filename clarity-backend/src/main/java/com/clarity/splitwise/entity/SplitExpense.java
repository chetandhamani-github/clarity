package com.clarity.splitwise.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "split_expenses", indexes = {
        @Index(name = "idx_split_expenses_inst_updated", columnList = "installation_id, updated_at DESC"),
        @Index(name = "idx_split_expenses_group", columnList = "group_id"),
        @Index(name = "idx_split_expenses_owner", columnList = "owner_email")
})
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class SplitExpense {

    @Id
    @Column(name = "id", nullable = false, length = 255)
    private String id;

    @Column(name = "installation_id", nullable = false, length = 255)
    private String installationId;

    @Column(name = "group_id", length = 255)
    private String groupId;

    @Column(name = "payer_id", nullable = false, length = 255)
    private String payerId;

    @Column(name = "payer_email", length = 255)
    private String payerEmail;

    @Column(name = "payer_name", length = 255)
    private String payerName;

    @Column(name = "description", nullable = false, length = 500)
    private String description;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "currency", length = 10)
    @Builder.Default
    private String currency = "INR";

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "date", nullable = false)
    @Builder.Default
    private Instant date = Instant.now();

    @Column(name = "split_type", nullable = false, length = 50)
    @Builder.Default
    private String splitType = "EQUAL";

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "receipt_url", length = 500)
    private String receiptUrl;

    @Column(name = "owner_email", length = 255)
    private String ownerEmail;

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

