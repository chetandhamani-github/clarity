package com.clarity.splitwise.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "split_expense_splits", indexes = {
        @Index(name = "idx_split_expense_splits_expense", columnList = "expense_id"),
        @Index(name = "idx_split_expense_splits_person", columnList = "person_id")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class SplitExpenseSplit {

    @Id
    @Column(name = "id", nullable = false, length = 255)
    private String id;

    @Column(name = "expense_id", nullable = false, length = 255)
    private String expenseId;

    @Column(name = "person_id", nullable = false, length = 255)
    private String personId;

    @Column(name = "person_email", length = 255)
    private String personEmail;

    @Column(name = "person_name", length = 255)
    private String personName;

    @Column(name = "paid_amount", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(name = "owed_amount", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal owedAmount = BigDecimal.ZERO;

    @Column(name = "percentage", precision = 6, scale = 2)
    private BigDecimal percentage;

    @Column(name = "shares", precision = 6, scale = 2)
    private BigDecimal shares;

    @Column(name = "is_paid", nullable = false)
    @Builder.Default
    private boolean isPaid = false;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}

