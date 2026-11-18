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
public class SplitSyncResponse {
    private boolean success;
    private String syncedAt;
    private List<SplitPersonDTO> people;
    private List<SplitDebtDTO> debts;
    private List<SplitSettlementDTO> settlements;
    private List<SplitGroupDTO> groups;
    private List<SplitExpenseDTO> expenses;
    private List<String> confirmedIds;
}
