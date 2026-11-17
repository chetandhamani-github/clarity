package com.clarity.splitwise.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SplitSyncRequest {
    private String installationId;
    private String lastSyncedAt;
    private List<SplitPersonDTO> people;
    private List<SplitDebtDTO> debts;
    private List<SplitSettlementDTO> settlements;
}
