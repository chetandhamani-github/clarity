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
public class SplitwiseSummaryResponse {
    private long totalPeople;
    private long totalDebts;
    private long totalSettlements;
    private BigDecimal totalOwedToMe;
    private BigDecimal totalIOwe;
    private BigDecimal netBalance;
}
