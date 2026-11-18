package com.clarity.ai.service;

import com.clarity.ai.dto.*;

public interface AiService {

    AiCategorizeResponse categorize(AiCategorizeRequest request);

    ReceiptScanResponse scanReceipt(ReceiptScanRequest request);

    AiChatResponse chat(AiChatRequest request);

    MonthlyDigestResponse generateDigest(MonthlyDigestRequest request);
}

