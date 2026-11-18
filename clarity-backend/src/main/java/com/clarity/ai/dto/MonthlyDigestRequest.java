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
@Schema(description = "Anonymized monthly statistics for AI financial health digest")
public class MonthlyDigestRequest {

    @Schema(description = "Month index (1-12)", example = "11")
    private Integer month;

    @Schema(description = "Year", example = "2026")
    private Integer year;

    @Schema(description = "Total monthly income", example = "85000.0")
    private Double totalIncome;

    @Schema(description = "Total monthly expenses", example = "52000.0")
    private Double totalExpenses;

    @Schema(description = "Top spending categories with amounts", example = "[\"Food & Dining: 14000\", \"Rent: 20000\", \"Groceries: 8500\"]")
    private List<String> topCategories;

    @Schema(description = "Needs allocation percentage", example = "50.0")
    private Double needsPercent;

    @Schema(description = "Wants allocation percentage", example = "30.0")
    private Double wantsPercent;

    @Schema(description = "Savings allocation percentage", example = "20.0")
    private Double savingsPercent;
}

