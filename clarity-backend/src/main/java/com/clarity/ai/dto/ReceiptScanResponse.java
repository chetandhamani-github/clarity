package com.clarity.ai.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Structured transaction extraction from a receipt")
public class ReceiptScanResponse {

    @Schema(description = "Merchant or store name", example = "Nature's Basket")
    private String merchant;

    @Schema(description = "Transaction date (YYYY-MM-DD)", example = "2026-11-18")
    private String date;

    @Schema(description = "Total bill amount", example = "1845.5")
    private Double totalAmount;

    @Schema(description = "Tax or GST amount", example = "92.5")
    private Double taxAmount;

    @Schema(description = "Primary category for transaction", example = "Groceries")
    private String category;

    @Schema(description = "Extracted line items for split expenses", example = "[]")
    private List<ReceiptItemDTO> items;

    @Schema(description = "OCR confidence score", example = "0.92")
    private Double confidence;
}

