package com.clarity.splitwise.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SplitExpenseDTO {
    private String id;
    private String groupId;
    private String payerId;
    private String description;
    private BigDecimal amount;
    private String currency;
    private String category;
    private String date;
    private String splitType;
    private String notes;
    private String receiptUrl;
    private String ownerEmail;
    private List<SplitExpenseSplitDTO> splits;
    private boolean isDeleted;
    private String createdAt;
    private String updatedAt;
}

