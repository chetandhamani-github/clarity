package com.clarity.ai.controller;

import com.clarity.ai.dto.*;
import com.clarity.ai.service.AiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "AI Gateway", description = "Privacy-preserving AI categorization, receipt scanning, and financial assistant endpoints")
public class AiController {

    private final AiService aiService;

    @PostMapping("/categorize")
    @Operation(summary = "Categorize transaction", description = "Classifies a raw merchant or UPI string into standardized financial category with confidence score")
    public ResponseEntity<AiCategorizeResponse> categorize(@Valid @RequestBody AiCategorizeRequest request) {
        AiCategorizeResponse response = aiService.categorize(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/receipt-scan")
    @Operation(summary = "Scan receipt image/text", description = "Multimodal extraction of merchant, date, total, and itemized splits from receipt payload")
    public ResponseEntity<ReceiptScanResponse> scanReceipt(@RequestBody ReceiptScanRequest request) {
        ReceiptScanResponse response = aiService.scanReceipt(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/chat")
    @Operation(summary = "Conversational financial copilot", description = "Answers queries about spending, budgets, and savings using anonymized context")
    public ResponseEntity<AiChatResponse> chat(@Valid @RequestBody AiChatRequest request) {
        AiChatResponse response = aiService.chat(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/digest")
    @Operation(summary = "Generate monthly financial digest", description = "Analyzes monthly aggregates under 50/30/20 guideline and returns health score & tips")
    public ResponseEntity<MonthlyDigestResponse> generateDigest(@RequestBody MonthlyDigestRequest request) {
        MonthlyDigestResponse response = aiService.generateDigest(request);
        return ResponseEntity.ok(response);
    }
}

