package com.clarity.ai.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Request payload for scanning a receipt image or raw text")
public class ReceiptScanRequest {

    @Schema(description = "Base64 encoded image bytes of the receipt", example = "data:image/jpeg;base64,/9j/4AAQSkZJRg...")
    private String imageBase64;

    @Schema(description = "Image MIME type", example = "image/jpeg")
    private String mimeType;

    @Schema(description = "Raw OCR text if pre-extracted on client", example = "Total: Rs 450.00 Date: 18/11/2026")
    private String rawText;
}

