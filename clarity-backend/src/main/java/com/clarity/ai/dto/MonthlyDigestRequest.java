package com.clarity.ai.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Anonymized monthly statistics for AI financial health digest")
public class MonthlyDigestRequest {

    @Min(1)
    @Max(12)
    @Schema(description = "Month index (1-12)", example = "11")
    private Integer month;

    @Min(1970)
    @Max(2100)
    @Schema(description = "Year", example = "2026")
    private Integer year;

    @DecimalMin("0.0")
    @Schema(description = "Total monthly income (or effective monthly income)", example = "85000.0")
    private Double totalIncome;

    @DecimalMin("0.0")
    @Schema(description = "Total monthly expenses", example = "52000.0")
    private Double totalExpenses;

    @DecimalMin("0.0")
    @Schema(description = "Optional planned monthly income from budget plan", example = "85000.0")
    private Double plannedIncome;

    @Schema(description = "Currency symbol for formatting numbers", example = "₹")
    private String currencySymbol;

    @Min(0)
    @Max(100)
    @Schema(description = "Canonical 5-pillar financial health score computed on-device (0-100)", example = "77")
    private Integer canonicalHealthScore;

    @Schema(description = "Optional anonymized summary of on-device health pillars")
    private String healthSummary;

    @Schema(description = "Top spending categories with amounts", example = "[\"Food & Dining: 14000\", \"Rent: 20000\", \"Groceries: 8500\"]")
    private List<String> topCategories;

    @Schema(description = "Needs allocation percentage", example = "50.0")
    private Double needsPercent;

    @Schema(description = "Wants allocation percentage", example = "30.0")
    private Double wantsPercent;

    @Schema(description = "Savings allocation percentage", example = "20.0")
    private Double savingsPercent;
}

