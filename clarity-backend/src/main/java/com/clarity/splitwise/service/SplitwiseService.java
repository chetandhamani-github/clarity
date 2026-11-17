package com.clarity.splitwise.service;

import com.clarity.splitwise.dto.SplitSyncRequest;
import com.clarity.splitwise.dto.SplitSyncResponse;
import com.clarity.splitwise.dto.SplitwiseSummaryResponse;

public interface SplitwiseService {

    SplitSyncResponse sync(String installationId, SplitSyncRequest request);

    SplitwiseSummaryResponse getSummary(String installationId);
}
