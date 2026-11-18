package com.clarity.ai.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Request payload for conversational financial copilot")
public class AiChatRequest {

    @NotBlank(message = "message must not be blank")
    @Schema(description = "User query or question", example = "How much did I spend on dining out this month?")
    private String message;

    @Schema(description = "Anonymized on-device financial statistics (no PII or account numbers)",
            example = "Total Spent: 25000, Income: 80000, Top Category: Food & Dining (4500), Active Month: 11-2026")
    private String financialContextSummary;
}

