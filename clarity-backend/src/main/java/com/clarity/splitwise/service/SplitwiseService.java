package com.clarity.splitwise.service;

import com.clarity.splitwise.dto.SplitSyncRequest;
import com.clarity.splitwise.dto.SplitSyncResponse;
import com.clarity.splitwise.dto.SplitwiseSummaryResponse;

public interface SplitwiseService {

    SplitSyncResponse sync(String installationId, SplitSyncRequest request);

    SplitSyncResponse sync(String installationId, SplitSyncRequest request, String authHeader);

    SplitwiseSummaryResponse getSummary(String installationId);

    SplitwiseSummaryResponse getSummary(String installationId, String authHeader);
}
