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
public class SplitSettlementDTO {
    private String id;
    private String personId;
    private BigDecimal amount;
    private String settlementType;
    private String description;
    private boolean isDeleted;
    private String createdAt;
    private String updatedAt;
}
