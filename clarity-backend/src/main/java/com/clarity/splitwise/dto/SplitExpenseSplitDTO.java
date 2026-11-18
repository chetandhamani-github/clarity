package com.clarity.splitwise.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SplitExpenseSplitDTO {
    private String id;
    private String expenseId;
    private String personId;
    private BigDecimal paidAmount;
    private BigDecimal owedAmount;
    private BigDecimal percentage;
    private BigDecimal shares;
    private boolean isPaid;
    private String createdAt;
}

