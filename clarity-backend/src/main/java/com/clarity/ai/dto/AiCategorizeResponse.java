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
@Schema(description = "AI transaction categorization prediction")
public class AiCategorizeResponse {

    @Schema(description = "Assigned standard category", example = "Groceries")
    private String category;

    @Schema(description = "Confidence score between 0.0 and 1.0", example = "0.95")
    private Double confidence;

    @Schema(description = "Recommended 50/30/20 budget bucket: needs, wants, or savings", example = "needs")
    private String suggestedBudgetBucket;

    @Schema(description = "Whether the merchant appears to be a recurring subscription", example = "false")
    private Boolean isRecurringSubscription;

    @Schema(description = "Clean normalized merchant display name", example = "Shree Ganesh Kirana")
    private String cleanMerchant;
}

