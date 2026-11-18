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
@Schema(description = "AI monthly financial health digest")
public class MonthlyDigestResponse {

    @Schema(description = "Headline summary for the month", example = "Great Progress: You saved 24% of your income this month!")
    private String headline;

    @Schema(description = "Evaluation of savings compared to 50/30/20 target", example = "Your savings rate exceeded your target by 4%, creating an additional cushion of ₹3,400.")
    private String savingsAssessment;

    @Schema(description = "Key financial observations and patterns", example = "[\"Dining out accounted for 27% of your discretionary spending.\", \"Electricity bill dropped by 15% compared to October.\"]")
    private List<String> insights;

    @Schema(description = "Actionable micro-goals for the upcoming month", example = "[\"Cook dinner on Friday nights to save an estimated ₹2,500.\", \"Review 2 unused streaming subscriptions.\"]")
    private List<String> actionableTips;

    @Schema(description = "Overall financial health score out of 100", example = "84")
    private Integer financialHealthScore;
}

